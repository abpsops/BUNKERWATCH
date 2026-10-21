import { createClient } from "@supabase/supabase-js"
import { haversineMeters, type VesselFix } from "./detection.js"

/**
 * Persists AIS fixes for the Live Map.
 *
 * - `vessel_positions`: one row per MMSI, upserted in batches so a busy
 *   anchorage (hundreds of vessels, several messages a second) turns into
 *   one HTTP call every few seconds instead of one per message.
 * - `vessel_position_history`: appended only when a vessel has moved far
 *   enough or enough time has passed, so 90 days of history stays small.
 */

const FLUSH_INTERVAL_MS = 5_000
const HISTORY_MIN_MOVE_METERS = 150
const HISTORY_MOVING_INTERVAL_MS = 2 * 60 * 1000
const HISTORY_STATIONARY_INTERVAL_MS = 10 * 60 * 1000

interface HistoryMark {
  lat: number
  lon: number
  at: number
}

export function makePositionWriter(url: string, serviceRoleKey: string) {
  const client = createClient(url, serviceRoleKey)
  const pending = new Map<number, VesselFix>()
  const lastHistory = new Map<number, HistoryMark>()
  let timer: NodeJS.Timeout | null = null
  let flushing = false

  function toRow(fix: VesselFix) {
    return {
      mmsi: fix.mmsi,
      imo: fix.imo,
      name: fix.name,
      ship_type: fix.shipType ?? null,
      destination: fix.destination ?? null,
      latitude: fix.latitude,
      longitude: fix.longitude,
      speed_knots: fix.speedKnots,
      course_deg: fix.courseDeg ?? null,
      heading_deg: fix.headingDeg ?? null,
      nav_status: fix.navStatus ?? null,
      source: fix.source ?? "aisstream",
      call_sign: fix.extras?.callSign ?? null,
      length_m: fix.extras?.lengthM ?? null,
      width_m: fix.extras?.widthM ?? null,
      draught_m: fix.extras?.draughtM ?? null,
      eta: fix.extras?.eta ?? null,
      dest_code: fix.extras?.destCode ?? null,
      received_at: new Date(fix.timestamp).toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  function wantsHistory(fix: VesselFix): boolean {
    const prev = lastHistory.get(fix.mmsi)
    if (!prev) return true
    const moved = haversineMeters(prev.lat, prev.lon, fix.latitude, fix.longitude)
    const age = fix.timestamp - prev.at
    if (moved >= HISTORY_MIN_MOVE_METERS && age >= HISTORY_MOVING_INTERVAL_MS) return true
    return age >= HISTORY_STATIONARY_INTERVAL_MS
  }

  async function flush() {
    if (flushing || pending.size === 0) return
    flushing = true
    const batch = [...pending.values()]
    pending.clear()
    try {
      const { error } = await client
        .from("vessel_positions")
        .upsert(batch.map(toRow), { onConflict: "mmsi" })
      if (error) console.error("[positions] upsert failed:", error.message)

      const historyRows = batch.filter(wantsHistory)
      if (historyRows.length > 0) {
        const { error: hErr } = await client.from("vessel_position_history").insert(
          historyRows.map((f) => ({
            mmsi: f.mmsi,
            imo: f.imo,
            latitude: f.latitude,
            longitude: f.longitude,
            speed_knots: f.speedKnots,
            course_deg: f.courseDeg ?? null,
            nav_status: f.navStatus ?? null,
            received_at: new Date(f.timestamp).toISOString(),
          }))
        )
        if (hErr) console.error("[positions] history insert failed:", hErr.message)
        else for (const f of historyRows) lastHistory.set(f.mmsi, { lat: f.latitude, lon: f.longitude, at: f.timestamp })
      }
      console.log(`[positions] upserted ${batch.length} vessels, ${historyRows.length} history points`)
    } catch (err) {
      console.error("[positions] flush error:", (err as Error).message)
    } finally {
      flushing = false
    }
  }

  return {
    /** Queue a fix; the latest one per MMSI wins within a flush window. */
    record(fix: VesselFix) {
      pending.set(fix.mmsi, fix)
    },
    /** Start periodic flushing (always-on worker mode). */
    start() {
      if (!timer) timer = setInterval(flush, FLUSH_INTERVAL_MS)
    },
    /** Flush whatever is queued now (poll mode / shutdown). */
    async flushNow() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      await flush()
    },
  }
}
