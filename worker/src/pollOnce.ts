import "dotenv/config"
import WebSocket from "ws"
if (!(globalThis as any).WebSocket) {
  ;(globalThis as any).WebSocket = WebSocket
}

import { createClient } from "@supabase/supabase-js"
import { AisStreamWorkerClient } from "./aisClient.js"
import { reconcile, type PersistedEncounter } from "./periodicReconcile.js"
import type { VesselFix } from "./detection.js"
import { makeSupabaseWriter, type TrackedBarge } from "./supabaseWriter.js"
import { makePositionWriter } from "./positionWriter.js"

const AISSTREAM_API_KEY = requireEnv("AISSTREAM_API_KEY")
const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

const LISTEN_WINDOW_MS = 90_000 // stays connected this long, then exits

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return v
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const writer = makeSupabaseWriter(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const barges = await writer.loadTrackedBarges()
  const bargesByImo = new Map(barges.map((b) => [b.imo, b]))
  console.log(`[fleet] tracking ${bargesByImo.size} barges`)

  // Load open encounters across all organizations that have tracked barges.
  const orgIds = [...new Set(barges.map((b) => b.organization_id))]
  const { data: openRows, error: loadErr } = await supabase
    .from("ais_encounter_state")
    .select("*")
    .in("organization_id", orgIds)
  if (loadErr) throw loadErr

  const openByOrg = new Map<string, PersistedEncounter[]>()
  for (const row of openRows ?? []) {
    const list = openByOrg.get(row.organization_id) ?? []
    list.push({
      bargeMmsi: Number(row.barge_mmsi),
      bargeImo: row.barge_imo,
      otherMmsi: Number(row.other_mmsi),
      otherImo: row.other_imo,
      otherName: row.other_name,
      firstSeen: new Date(row.first_seen).getTime(),
      lastSeen: new Date(row.last_seen).getTime(),
      lastLat: Number(row.last_latitude),
      lastLon: Number(row.last_longitude),
    })
    openByOrg.set(row.organization_id, list)
  }
  console.log(`[state] ${openRows?.length ?? 0} open encounters loaded`)

  // Listen for a fixed window, collecting every fix seen.
  const fixesByMmsi = new Map<number, VesselFix>()
  const client = new AisStreamWorkerClient(AISSTREAM_API_KEY)
  client.onFix((fix) => fixesByMmsi.set(fix.mmsi, fix))
  client.start()

  await new Promise((resolve) => setTimeout(resolve, LISTEN_WINDOW_MS))
  client.stop()

  const allFixes = [...fixesByMmsi.values()]
  console.log(`[ais] collected ${allFixes.length} vessel fixes this run`)

  // Persist every fix for the Live Map (15-minute freshness in poll mode).
  const positions = makePositionWriter(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  allFixes.forEach((f) => positions.record(f))
  await positions.flushNow()

  const bargeFixes = allFixes.filter((f) => f.imo && bargesByImo.has(f.imo))
  const otherFixes = allFixes.filter((f) => !(f.imo && bargesByImo.has(f.imo)))

  // Group barge fixes by organization (a barge IMO belongs to exactly one org).
  const bargeFixesByOrg = new Map<string, VesselFix[]>()
  for (const fix of bargeFixes) {
    const barge = bargesByImo.get(fix.imo!)!
    const list = bargeFixesByOrg.get(barge.organization_id) ?? []
    list.push(fix)
    bargeFixesByOrg.set(barge.organization_id, list)
  }

  const now = Date.now()
  for (const orgId of orgIds) {
    const orgBargeFixes = bargeFixesByOrg.get(orgId) ?? []
    const orgOpen = openByOrg.get(orgId) ?? []
    const { stillOpen, newlyClosed } = reconcile(orgBargeFixes, otherFixes, orgOpen, now)

    // Replace this org's open-encounter rows wholesale with the reconciled set.
    await supabase.from("ais_encounter_state").delete().eq("organization_id", orgId)
    if (stillOpen.length > 0) {
      const { error } = await supabase.from("ais_encounter_state").insert(
        stillOpen.map((e) => ({
          organization_id: orgId,
          barge_mmsi: e.bargeMmsi,
          barge_imo: e.bargeImo,
          other_mmsi: e.otherMmsi,
          other_imo: e.otherImo,
          other_name: e.otherName,
          first_seen: new Date(e.firstSeen).toISOString(),
          last_seen: new Date(e.lastSeen).toISOString(),
          last_latitude: e.lastLat,
          last_longitude: e.lastLon,
        }))
      )
      if (error) console.error("[state] failed to save open encounters:", error.message)
    }

    for (const enc of newlyClosed) {
      const barge = bargesByImo.get(enc.bargeImo)
      if (barge) await writer.writeDetectedEncounter(barge, enc)
    }

    console.log(`[org ${orgId}] ${stillOpen.length} still open, ${newlyClosed.length} newly closed`)
  }

  console.log("done")
  process.exit(0)
}

main().catch((err) => {
  console.error("fatal:", err)
  process.exit(1)
})
