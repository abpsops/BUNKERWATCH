import type { VesselFix } from "./detection.js"

/**
 * ShipFinder (Elane) "Vessels in Zone" — polls every vessel inside the
 * Fujairah / Khor Fakkan polygon. Unlike AISStream's volunteer receivers,
 * ShipFinder merges terrestrial + satellite AIS, so the anchorage is fully
 * populated, and each record carries IMO, dimensions, draught, destination
 * and ETA. Docs: https://docs.shipfinder.com/429583708e0
 */

const ENDPOINT = "https://api.elaneglobal.com/v1/AIS/VesselsInZone"

// Polygon as lng,lat pairs joined with "-" (ShipFinder's format). Covers the
// Fujairah OPL anchorage, Khor Fakkan and the approaches — about 1°×1°, the
// size ShipFinder recommends per request.
export const FUJAIRAH_ZONE: [number, number][] = [
  [56.0, 24.8],
  [57.2, 24.8],
  [57.2, 25.7],
  [56.0, 25.7],
]

export type ShipFinderFix = VesselFix

interface ShipRecord {
  mmsi: number
  imo: number
  call_sign: string
  ship_name: string
  ship_type: number
  length: number
  width: number
  draught: number
  dest: string
  destcode: string
  eta: string
  navistat: number
  lat: number
  lng: number
  sog: number
  cog: number
  hdg: number
  last_time: number // epoch seconds
}

interface ZoneResponse {
  status: number
  msg: string
  data?: { total: number; scode: number; continue: number; ship_list: ShipRecord[] }
}

export function regionParam(zone: [number, number][]): string {
  return zone.map(([lng, lat]) => `${lng},${lat}`).join("-")
}

export function toFix(r: ShipRecord): ShipFinderFix {
  const imo = r.imo && r.imo > 0 ? String(r.imo).padStart(7, "0") : null
  const eta = r.eta && /^\d+$/.test(r.eta) ? new Date(Number(r.eta) * 1000).toISOString() : null
  return {
    mmsi: r.mmsi,
    imo,
    name: r.ship_name?.trim() || null,
    latitude: r.lat,
    longitude: r.lng,
    speedKnots: typeof r.sog === "number" ? r.sog : null,
    timestamp: r.last_time * 1000,
    courseDeg: typeof r.cog === "number" ? r.cog : null,
    headingDeg: typeof r.hdg === "number" && r.hdg !== 511 ? r.hdg : null,
    navStatus: typeof r.navistat === "number" ? r.navistat : null,
    shipType: typeof r.ship_type === "number" ? r.ship_type : null,
    destination: r.dest?.trim() || null,
    source: "shipfinder",
    extras: {
      callSign: r.call_sign?.trim() || null,
      lengthM: r.length > 0 ? r.length : null,
      widthM: r.width > 0 ? r.width : null,
      draughtM: r.draught > 0 ? r.draught : null,
      eta,
      destCode: r.destcode?.trim() || null,
    },
  }
}

/** One full sweep of the zone, following scode pages until `continue` is 0. */
export async function fetchZone(apiKey: string, zone = FUJAIRAH_ZONE, fetchImpl = fetch): Promise<ShipFinderFix[]> {
  const out: ShipFinderFix[] = []
  let scode: number | undefined
  for (let page = 0; page < 20; page++) {
    const url = new URL(ENDPOINT)
    url.searchParams.set("key", apiKey)
    url.searchParams.set("region", regionParam(zone))
    url.searchParams.set("output", "1")
    if (scode !== undefined) url.searchParams.set("scode", String(scode))
    const res = await fetchImpl(url.toString())
    const text = await res.text()
    if (!res.ok) throw new Error(`ShipFinder HTTP ${res.status}: ${text.slice(0, 300)}`)
    let body: ZoneResponse
    try {
      body = JSON.parse(text) as ZoneResponse
    } catch {
      throw new Error(`ShipFinder non-JSON response: ${text.slice(0, 300)}`)
    }
    if (body.status !== 0) throw new Error(`ShipFinder status ${body.status}: ${body.msg || "(no message)"}`)
    const list = body.data?.ship_list ?? []
    for (const r of list) {
      if (typeof r.lat !== "number" || typeof r.lng !== "number" || !r.mmsi) continue
      out.push(toFix(r))
    }
    if (!body.data?.continue) break
    scode = body.data.scode
  }
  return out
}

type FixListener = (fix: ShipFinderFix) => void

export class ShipFinderPoller {
  private listeners = new Set<FixListener>()
  private timer: NodeJS.Timeout | null = null
  private running = false
  private consecutiveErrors = 0
  private errorListeners = new Set<(err: Error, consecutive: number) => void>()

  constructor(
    private apiKey: string,
    private intervalMs: number,
    private zone: [number, number][] = FUJAIRAH_ZONE
  ) {}

  onFix(fn: FixListener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  onError(fn: (err: Error, consecutive: number) => void) {
    this.errorListeners.add(fn)
    return () => this.errorListeners.delete(fn)
  }

  start() {
    if (this.running) return
    this.running = true
    void this.tick()
  }

  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
  }

  private async tick() {
    if (!this.running) return
    const started = Date.now()
    try {
      const fixes = await fetchZone(this.apiKey, this.zone)
      this.consecutiveErrors = 0
      for (const f of fixes) this.listeners.forEach((l) => l(f))
      console.log(`[shipfinder] ${fixes.length} vessels in zone (${Date.now() - started} ms)`)
    } catch (err) {
      this.consecutiveErrors++
      console.error(`[shipfinder] poll failed (${this.consecutiveErrors}x):`, (err as Error).message)
      this.errorListeners.forEach((l) => l(err as Error, this.consecutiveErrors))
    }
    // Back off on repeated failures (quota exhausted, key rejected) so a dead
    // key doesn't hammer the API: 1x, 2x, 4x … up to 16x the interval.
    const factor = Math.min(16, 2 ** Math.max(0, this.consecutiveErrors - 1))
    const wait = Math.max(5_000, this.intervalMs * factor - (Date.now() - started))
    this.timer = setTimeout(() => void this.tick(), wait)
  }
}
