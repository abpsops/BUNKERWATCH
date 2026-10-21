import "dotenv/config"
import WebSocket from "ws"

// supabase-js initializes a realtime client during createClient() that
// requires a global WebSocket — natively available only from Node 22+.
// This worker doesn't use realtime subscriptions, but the client still
// needs the global to exist or construction throws immediately.
if (!(globalThis as any).WebSocket) {
  ;(globalThis as any).WebSocket = WebSocket
}

import { AisStreamWorkerClient } from "./aisClient.js"
import { ShipFinderPoller } from "./shipfinderClient.js"
import { EncounterTracker, type VesselFix } from "./detection.js"
import { makeSupabaseWriter, type TrackedBarge } from "./supabaseWriter.js"
import { makePositionWriter } from "./positionWriter.js"

// Feeds: ShipFinder (polled, full anchorage coverage) when a key is set, and
// AISStream (streamed, free) when its key is set. Both may run together.
const SHIPFINDER_API_KEY = process.env.SHIPFINDER_API_KEY || ""
const SHIPFINDER_POLL_MS = Number(process.env.SHIPFINDER_POLL_MS ?? 60_000)
const AISSTREAM_API_KEY = process.env.AISSTREAM_API_KEY || ""
if (!SHIPFINDER_API_KEY && !AISSTREAM_API_KEY) {
  console.error("Set SHIPFINDER_API_KEY and/or AISSTREAM_API_KEY")
  process.exit(1)
}
const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

const BARGE_REFRESH_MS = 5 * 60 * 1000
const SWEEP_INTERVAL_MS = 60 * 1000
const FIX_STALE_MS = 15 * 60 * 1000 // ignore fixes older than this when pairing
// Optional: exit cleanly after this many ms (used by the GitHub Actions
// "live" workflow, whose jobs are capped at 6 hours and chain into the next).
const MAX_RUNTIME_MS = Number(process.env.MAX_RUNTIME_MS ?? 0)

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return v
}

async function main() {
  const writer = makeSupabaseWriter(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const positions = makePositionWriter(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  positions.start()
  const tracker = new EncounterTracker()

  let bargesByImo = new Map<string, TrackedBarge>()
  const refreshBarges = async () => {
    try {
      const barges = await writer.loadTrackedBarges()
      bargesByImo = new Map(barges.map((b) => [b.imo, b]))
      console.log(`[fleet] tracking ${bargesByImo.size} barges`)
    } catch (err) {
      console.error("[fleet] failed to refresh barges:", (err as Error).message)
    }
  }
  await refreshBarges()
  setInterval(refreshBarges, BARGE_REFRESH_MS)

  // Latest known fix per MMSI, for every vessel seen in the bounding box.
  const latestFixes = new Map<number, VesselFix>()

  const onFix = (fix: VesselFix) => {
    latestFixes.set(fix.mmsi, fix)
    positions.record(fix) // every vessel in the box, for the Live Map
    if (!fix.imo) return // can't pair without IMO on at least one side being a barge

    const isBarge = bargesByImo.has(fix.imo)
    const now = Date.now()

    if (isBarge) {
      const barge = bargesByImo.get(fix.imo)!
      for (const other of latestFixes.values()) {
        if (other.mmsi === fix.mmsi) continue
        if (other.imo && bargesByImo.has(other.imo)) continue // skip barge-to-barge
        if (now - other.timestamp > FIX_STALE_MS) continue
        const encounter = tracker.update(fix, other)
        if (encounter) writer.writeDetectedEncounter(barge, encounter)
      }
    } else {
      for (const bargeFix of latestFixes.values()) {
        if (!bargeFix.imo || !bargesByImo.has(bargeFix.imo)) continue
        if (now - bargeFix.timestamp > FIX_STALE_MS) continue
        const barge = bargesByImo.get(bargeFix.imo)!
        const encounter = tracker.update(bargeFix, fix)
        if (encounter) writer.writeDetectedEncounter(barge, encounter)
      }
    }
  }

  const sources: { name: string; start(): void; stop(): void }[] = []
  if (SHIPFINDER_API_KEY) {
    const sf = new ShipFinderPoller(SHIPFINDER_API_KEY, SHIPFINDER_POLL_MS)
    sf.onFix(onFix)
    // Surface feed problems where they can be read without CI log access.
    sf.onError((err, n) => {
      if (n === 1 || n % 10 === 0) void writer.writeDiagnostic("shipfinder_error", { message: err.message, consecutive: n })
    })
    sources.push({ name: "shipfinder", start: () => sf.start(), stop: () => sf.stop() })
  }
  if (AISSTREAM_API_KEY) {
    const ais = new AisStreamWorkerClient(AISSTREAM_API_KEY)
    ais.onFix((f) => onFix({ ...f, source: "aisstream" }))
    sources.push({ name: "aisstream", start: () => ais.start(), stop: () => ais.stop() })
  }
  console.log(`[feeds] ${sources.map((s) => s.name).join(" + ")}`)

  setInterval(() => {
    const stale = tracker.sweepStale(Date.now())
    for (const enc of stale) {
      const barge = bargesByImo.get(enc.bargeImo)
      if (barge) writer.writeDetectedEncounter(barge, enc)
    }
  }, SWEEP_INTERVAL_MS)

  sources.forEach((s) => s.start())

  const shutdown = async () => {
    console.log("shutting down…")
    sources.forEach((s) => s.stop())
    await positions.flushNow()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
  if (MAX_RUNTIME_MS > 0) {
    setTimeout(() => {
      console.log(`[runtime] reached MAX_RUNTIME_MS (${Math.round(MAX_RUNTIME_MS / 60000)} min), handing over`)
      void shutdown()
    }, MAX_RUNTIME_MS)
  }
}

main().catch((err) => {
  console.error("fatal:", err)
  process.exit(1)
})
