import { createClient } from "@supabase/supabase-js"
import type { DetectedEncounter } from "./detection.js"

export interface TrackedBarge {
  id: string
  organization_id: string
  competitor_id: string
  competitor_name: string
  name: string
  imo: string
}

export function makeSupabaseWriter(url: string, serviceRoleKey: string) {
  // Service-role key bypasses Row Level Security — this must only ever run
  // server-side (this worker), never in a browser bundle.
  const client = createClient(url, serviceRoleKey)

  return {
    async writeDiagnostic(kind: string, payload: Record<string, unknown>): Promise<void> {
      const { error } = await client.from("worker_diagnostics").insert({ kind, payload })
      if (error) console.error("[diag] insert failed:", error.message)
    },

    async loadTrackedBarges(): Promise<TrackedBarge[]> {
      const { data, error } = await client
        .from("barges")
        .select("id, organization_id, competitor_id, name, imo, competitors(name)")
        .eq("active", true)
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        id: row.id,
        organization_id: row.organization_id,
        competitor_id: row.competitor_id,
        competitor_name: row.competitors?.name ?? "Unknown",
        name: row.name,
        imo: row.imo,
      }))
    },

    async writeDetectedEncounter(barge: TrackedBarge, enc: DetectedEncounter) {
      const durationMinutes = Math.round((enc.endTime - enc.startTime) / 60000)
      const sourceRecordId = `ais_${enc.bargeMmsi}_${enc.otherMmsi}_${enc.startTime}`

      const { error } = await client.from("sts_operations").upsert(
        {
          organization_id: barge.organization_id,
          barge_id: barge.id,
          barge_imo: barge.imo,
          barge_name: barge.name,
          competitor_id: barge.competitor_id,
          competitor_name: barge.competitor_name,
          receiving_vessel_id: null,
          receiving_vessel_imo: enc.otherImo,
          receiving_vessel_name: enc.otherName ?? `MMSI ${enc.otherMmsi}`,
          operation_date: new Date(enc.startTime).toISOString().slice(0, 10),
          start_time: new Date(enc.startTime).toISOString().slice(11, 16),
          end_time: new Date(enc.endTime).toISOString().slice(11, 16),
          duration_minutes: durationMinutes,
          location: enc.location,
          latitude: enc.latitude,
          longitude: enc.longitude,
          operation_type: "OTHER_STS",
          raw_operation_label: "AIS-detected proximity event",
          source_provider: "ais_detection",
          source_record_id: sourceRecordId,
          confidence: "medium",
        },
        { onConflict: "organization_id,source_provider,source_record_id", ignoreDuplicates: true }
      )
      if (error) console.error("[supabase] write failed:", error.message)
      else console.log(`[detected] ${barge.name} <> ${enc.otherName ?? enc.otherMmsi} @ ${enc.location} (${durationMinutes}m)`)
    },
  }
}
