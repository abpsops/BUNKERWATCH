import type { FleetVessel } from "./shipfinderClient.js"

/**
 * ShipFinder "Ship-to-Ship (STS) Events" — for one vessel and a window of at
 * most 7 days, returns every vessel it came alongside: who, where, which
 * zone (1 = in port, 2 = at anchorage, 3 = elsewhere), start, end, duration.
 * Docs: https://docs.shipfinder.com/430352093e0
 *
 * This is the barge's "activity": each event with a real cargo vessel is a
 * bunkering (or at least a supply) operation, which is exactly what the
 * Track-FKO / BARGES-SL pages count.
 */

const ENDPOINT = "https://api.elaneglobal.com/v1/History/VesselStsEvents"
export const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface StsEvent {
  bargeMmsi: number
  otherMmsi: number
  otherImo: string | null
  otherName: string | null
  otherShipType: number | null
  zone: 1 | 2 | 3
  portCode: string | null
  startMs: number
  endMs: number
  durationMin: number
  latitude: number
  longitude: number
  sog: number | null
}

interface ApiEvent {
  approach_event: {
    approach_time: number
    separation_time: number
    duration: number // minutes
    approach_zone: number
    lat: number
    lng: number
    port_code: string
    sog: number
  }
  approach_ship: { mmsi: number; imo: number; call_sign: string; ship_name: string; ship_type: number }
}

interface ApiResponse {
  status: number
  msg: string
  data?: { approach_data?: ApiEvent[]; ship_data?: { mmsi: number } }
}

export async function fetchStsEvents(
  apiKey: string,
  mmsi: number,
  startMs: number,
  endMs: number,
  zone: 1 | 2 | 3,
  fetchImpl = fetch
): Promise<StsEvent[]> {
  if (endMs - startMs > MAX_WINDOW_MS) throw new Error("STS window must be ≤ 7 days")
  const url = new URL(ENDPOINT)
  url.searchParams.set("key", apiKey)
  url.searchParams.set("mmsi", String(mmsi))
  url.searchParams.set("start_time", String(Math.floor(startMs / 1000)))
  url.searchParams.set("end_time", String(Math.floor(endMs / 1000)))
  url.searchParams.set("approach_zone", String(zone))
  const res = await fetchImpl(url.toString())
  const text = await res.text()
  if (!res.ok) throw new Error(`ShipFinder HTTP ${res.status}: ${text.slice(0, 300)}`)
  let body: ApiResponse
  try {
    body = JSON.parse(text) as ApiResponse
  } catch {
    throw new Error(`ShipFinder non-JSON response: ${text.slice(0, 300)}`)
  }
  if (body.status === 3) return [] // "target does not exist" — no events, not an error
  if (body.status !== 0) throw new Error(`ShipFinder status ${body.status}: ${body.msg || "(no message)"}`)
  const out: StsEvent[] = []
  for (const e of body.data?.approach_data ?? []) {
    const ev = e.approach_event
    const sh = e.approach_ship
    if (!ev || !sh?.mmsi || typeof ev.approach_time !== "number") continue
    const startMs2 = ev.approach_time * 1000
    const endMs2 = (ev.separation_time || ev.approach_time) * 1000
    out.push({
      bargeMmsi: mmsi,
      otherMmsi: sh.mmsi,
      otherImo: sh.imo > 0 ? String(sh.imo).padStart(7, "0") : null,
      otherName: sh.ship_name?.trim() || null,
      otherShipType: typeof sh.ship_type === "number" ? sh.ship_type : null,
      zone: (ev.approach_zone === 1 || ev.approach_zone === 2 ? ev.approach_zone : 3) as 1 | 2 | 3,
      portCode: ev.port_code?.trim() || null,
      startMs: startMs2,
      endMs: endMs2,
      durationMin: typeof ev.duration === "number" && ev.duration > 0 ? Math.round(ev.duration) : Math.round((endMs2 - startMs2) / 60000),
      latitude: ev.lat,
      longitude: ev.lng,
      sog: typeof ev.sog === "number" ? ev.sog : null,
    })
  }
  return out
}

/** AIS type codes that are never a bunkering customer: service craft, fishing, pleasure. */
const SERVICE_TYPES = new Set([30, 31, 32, 33, 34, 35, 36, 37, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59])

export type OperationType = "STS_BUNKERING" | "STS_SUPPLY" | "OTHER_STS"

/**
 * Classify an alongside event. A barge alongside a merchant vessel for an
 * hour or more is a bunkering call; a short touch or a tug/pilot is not.
 */
export function classify(ev: StsEvent, isTrackedBarge: (mmsi: number, imo: string | null) => boolean): { type: OperationType; confidence: "high" | "medium" | "low" } {
  if (isTrackedBarge(ev.otherMmsi, ev.otherImo)) return { type: "OTHER_STS", confidence: "low" }
  if (ev.otherShipType !== null && SERVICE_TYPES.has(ev.otherShipType)) return { type: "OTHER_STS", confidence: "low" }
  if (ev.durationMin >= 60) return { type: "STS_BUNKERING", confidence: "high" }
  if (ev.durationMin >= 20) return { type: "STS_BUNKERING", confidence: "medium" }
  return { type: "OTHER_STS", confidence: "low" }
}

export function zoneLabel(ev: StsEvent): string {
  const z = ev.zone === 1 ? "Port" : ev.zone === 2 ? "Anchorage" : "Offshore"
  return ev.portCode ? `${z} ${ev.portCode}` : z
}

export interface StsSyncDeps {
  getFleet: () => FleetVessel[]
  isTrackedBarge: (mmsi: number, imo: string | null) => boolean
  write: (barge: FleetVessel, ev: StsEvent, cls: ReturnType<typeof classify>) => Promise<void>
  onError?: (err: Error) => void
}

/**
 * Periodically pulls the last 7 days of STS events for every tracked barge.
 * One request per barge per zone, so a 100-barge fleet costs 300 credits
 * per sync with the default zones; the interval is hours, not minutes.
 */
export class ShipFinderStsSync {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private apiKey: string,
    private intervalMs: number,
    private zones: (1 | 2 | 3)[],
    private deps: StsSyncDeps,
    private fetchImpl = fetch
  ) {}

  start() {
    if (this.running) return
    this.running = true
    void this.cycle()
  }

  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
  }

  async runOnce(): Promise<{ barges: number; events: number; quotaHit: boolean }> {
    const fleet = this.deps.getFleet().filter((v) => v.mmsi && /^\d{9}$/.test(v.mmsi))
    const end = Date.now()
    const start = end - MAX_WINDOW_MS
    let events = 0
    let quotaHit = false
    outer: for (const barge of fleet) {
      for (const zone of this.zones) {
        try {
          const evs = await fetchStsEvents(this.apiKey, Number(barge.mmsi), start, end, zone, this.fetchImpl)
          for (const ev of evs) {
            await this.deps.write(barge, ev, classify(ev, this.deps.isTrackedBarge))
            events++
          }
        } catch (err) {
          const msg = (err as Error).message
          this.deps.onError?.(err as Error)
          if (/status (12|22|23|29|38)\b/.test(msg) || /status 21\b/.test(msg)) {
            quotaHit = true
            break outer
          }
        }
        await new Promise((r) => setTimeout(r, 250)) // be polite to the rate limiter
      }
    }
    console.log(`[sts-sync] ${fleet.length} barges, ${events} events${quotaHit ? " (stopped: quota)" : ""}`)
    return { barges: fleet.length, events, quotaHit }
  }

  private async cycle() {
    if (!this.running) return
    const started = Date.now()
    let wait = this.intervalMs
    try {
      const r = await this.runOnce()
      if (r.quotaHit) wait = Math.max(this.intervalMs, 60 * 60 * 1000)
    } catch (err) {
      console.error("[sts-sync] cycle failed:", (err as Error).message)
    }
    this.timer = setTimeout(() => void this.cycle(), Math.max(60_000, wait - (Date.now() - started)))
  }
}
