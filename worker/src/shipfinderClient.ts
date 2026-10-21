import type { VesselFix } from "./detection.js"

/**
 * ShipFinder (Elane) "Vessels in Zone" — polls every vessel inside the
 * Fujairah / Khor Fakkan polygon. Unlike AISStream's volunteer receivers,
 * ShipFinder merges terrestrial + satellite AIS, so the anchorage is fully
 * populated, and each record carries IMO, dimensions, draught, destination
 * and ETA. Docs: https://docs.shipfinder.com/429583708e0
 */

const BASE = "https://api.elaneglobal.com"
const ENDPOINT = `${BASE}/v1/AIS/VesselsInZone`
const SEARCH_ENDPOINTS = [`${BASE}/v1/AIS/VesselSearch`, `${BASE}/apicall/v3/VesselSearch`]
const MULTI_ENDPOINT = `${BASE}/v1/AIS/VesselPositionMulti`

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
  eta: string | number
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

interface Envelope<T> {
  status: number
  msg: string
  data?: T
}

async function getJson<T>(url: string, fetchImpl = fetch): Promise<Envelope<T>> {
  const res = await fetchImpl(url)
  const text = await res.text()
  if (!res.ok) throw new Error(`ShipFinder HTTP ${res.status}: ${text.slice(0, 300)}`)
  try {
    return JSON.parse(text) as Envelope<T>
  } catch {
    throw new Error(`ShipFinder non-JSON response: ${text.slice(0, 300)}`)
  }
}

export interface SearchHit {
  match_type: number
  mmsi: number
  imo: number
  call_sign: string
  ship_name: string
  last_time: number
}

/**
 * Resolve an IMO to its current MMSI. Vessel Search returns every MMSI the
 * IMO has ever used; the one with the latest AIS report is the live one.
 */
export async function resolveMmsiByImo(apiKey: string, imo: string, fetchImpl = fetch): Promise<number | null> {
  let lastErr: Error | null = null
  for (const ep of SEARCH_ENDPOINTS) {
    const url = new URL(ep)
    url.searchParams.set("key", apiKey)
    url.searchParams.set("keywords", imo)
    url.searchParams.set("max", "20")
    try {
      const body = await getJson<SearchHit[]>(url.toString(), fetchImpl)
      if (body.status !== 0) throw new Error(`ShipFinder status ${body.status}: ${body.msg || "(no message)"}`)
      const hits = (body.data ?? []).filter((h) => String(h.imo) === String(Number(imo)) && h.mmsi > 0)
      if (hits.length === 0) return null
      hits.sort((a, b) => (b.last_time ?? 0) - (a.last_time ?? 0))
      return hits[0].mmsi
    } catch (e) {
      lastErr = e as Error
      // A 404 on the v1 path means the alternate path applies; anything else is final.
      if (!/HTTP 404/.test(lastErr.message)) throw lastErr
    }
  }
  throw lastErr ?? new Error("ShipFinder search failed")
}

/** Latest position for up to 100 MMSIs in one call (credit-metered per valid MMSI). */
export async function fetchMulti(apiKey: string, mmsis: number[], fetchImpl = fetch): Promise<ShipFinderFix[]> {
  const out: ShipFinderFix[] = []
  for (let i = 0; i < mmsis.length; i += 100) {
    const chunk = mmsis.slice(i, i + 100)
    const url = new URL(MULTI_ENDPOINT)
    url.searchParams.set("key", apiKey)
    url.searchParams.set("mmsis", chunk.join(","))
    const body = await getJson<ShipRecord[]>(url.toString(), fetchImpl)
    if (body.status !== 0) throw new Error(`ShipFinder status ${body.status}: ${body.msg || "(no message)"}`)
    for (const r of body.data ?? []) {
      if (typeof r.lat !== "number" || typeof r.lng !== "number" || !r.mmsi) continue
      if (r.lat === 0 && r.lng === 0) continue
      out.push(toFix(r))
    }
  }
  return out
}

export function regionParam(zone: [number, number][]): string {
  return zone.map(([lng, lat]) => `${lng},${lat}`).join("-")
}

export function toFix(r: ShipRecord): ShipFinderFix {
  const imo = r.imo && r.imo > 0 ? String(r.imo).padStart(7, "0") : null
  const etaNum = typeof r.eta === "number" ? r.eta : /^\d+$/.test(r.eta ?? "") ? Number(r.eta) : 0
  const eta = etaNum > 0 ? new Date(etaNum * 1000).toISOString() : null
  return {
    mmsi: r.mmsi,
    imo,
    name: r.ship_name?.trim() || null,
    latitude: r.lat,
    longitude: r.lng,
    speedKnots: typeof r.sog === "number" && r.sog >= 0 ? r.sog : null,
    timestamp: r.last_time * 1000,
    courseDeg: typeof r.cog === "number" && r.cog >= 0 ? r.cog : null,
    headingDeg: typeof r.hdg === "number" && r.hdg !== 511 ? r.hdg : null,
    navStatus: typeof r.navistat === "number" && r.navistat >= 0 && r.navistat < 16 ? r.navistat : null,
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


export interface FleetVessel {
  id: string
  name: string
  imo: string
  mmsi: string | null
}

/**
 * Polls the latest position of the tracked barges only (Multi-vessel
 * Position), resolving IMO → MMSI once per barge via Vessel Search and
 * caching it through `persistMmsi`. Credits are spent per MMSI per poll, so
 * the interval should be minutes, not seconds.
 */
export class ShipFinderFleetPoller {
  private listeners = new Set<FixListener>()
  private errorListeners = new Set<(err: Error, consecutive: number) => void>()
  private timer: NodeJS.Timeout | null = null
  private running = false
  private consecutiveErrors = 0
  private unresolvable = new Map<string, number>() // imo -> next retry epoch ms

  constructor(
    private apiKey: string,
    private intervalMs: number,
    private getFleet: () => FleetVessel[],
    private persistMmsi: (bargeId: string, mmsi: string) => Promise<void>
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

  /** Fill in missing MMSIs. Returns the number of lookups attempted. */
  private async resolveMissing(fleet: FleetVessel[]): Promise<number> {
    let attempted = 0
    const now = Date.now()
    for (const v of fleet) {
      if (v.mmsi || !/^\d{7}$/.test(v.imo)) continue
      const retryAt = this.unresolvable.get(v.imo) ?? 0
      if (retryAt > now) continue
      attempted++
      try {
        const mmsi = await resolveMmsiByImo(this.apiKey, v.imo)
        if (mmsi) {
          v.mmsi = String(mmsi)
          await this.persistMmsi(v.id, v.mmsi)
          console.log(`[shipfinder] ${v.name} IMO ${v.imo} → MMSI ${mmsi}`)
        } else {
          this.unresolvable.set(v.imo, now + 24 * 60 * 60 * 1000)
          console.warn(`[shipfinder] no MMSI found for ${v.name} IMO ${v.imo}; retry in 24 h`)
        }
      } catch (err) {
        this.unresolvable.set(v.imo, now + 60 * 60 * 1000)
        throw err
      }
    }
    return attempted
  }

  private async tick() {
    if (!this.running) return
    const started = Date.now()
    try {
      const fleet = this.getFleet()
      await this.resolveMissing(fleet)
      const mmsis = [...new Set(fleet.map((v) => Number(v.mmsi)).filter((m) => m > 0))]
      if (mmsis.length === 0) {
        console.warn("[shipfinder] fleet has no resolvable MMSIs yet")
      } else {
        const fixes = await fetchMulti(this.apiKey, mmsis)
        for (const f of fixes) this.listeners.forEach((l) => l(f))
        console.log(`[shipfinder] fleet poll: ${fixes.length}/${mmsis.length} positions (${Date.now() - started} ms)`)
      }
      this.consecutiveErrors = 0
    } catch (err) {
      this.consecutiveErrors++
      console.error(`[shipfinder] fleet poll failed (${this.consecutiveErrors}x):`, (err as Error).message)
      this.errorListeners.forEach((l) => l(err as Error, this.consecutiveErrors))
    }
    const factor = Math.min(16, 2 ** Math.max(0, this.consecutiveErrors - 1))
    const wait = Math.max(30_000, this.intervalMs * factor - (Date.now() - started))
    this.timer = setTimeout(() => void this.tick(), wait)
  }
}
