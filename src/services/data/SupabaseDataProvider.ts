import type { Barge, Competitor, DataImport, STSFilters, STSOperation, Vessel } from "@/types"
import type { MaritimeDataProvider } from "./DataProvider"
import { supabase } from "@/services/supabase/client"
import { fingerprintOperation } from "@/lib/fingerprint"

/**
 * Talks to Supabase Postgres directly via supabase-js. Row Level Security
 * (see supabase/schema.sql) scopes every query to the caller's
 * organization_id automatically — this class never filters by org itself.
 */
export class SupabaseDataProvider implements MaritimeDataProvider {
  readonly name = "Supabase"
  readonly isDemo = false

  private client() {
    if (!supabase) throw new Error("Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY")
    return supabase
  }

  async getCompetitors(): Promise<Competitor[]> {
    const { data, error } = await this.client().from("competitors").select("*").order("name")
    if (error) throw error
    return data as Competitor[]
  }

  async getCompetitor(id: string): Promise<Competitor | null> {
    const { data, error } = await this.client().from("competitors").select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data as Competitor | null
  }

  async upsertCompetitor(c: Partial<Competitor> & { name: string; code: string }): Promise<Competitor> {
    const { data, error } = await this.client().from("competitors").upsert(c).select().single()
    if (error) throw error
    return data as Competitor
  }

  async deleteCompetitor(id: string): Promise<void> {
    const { error } = await this.client().from("competitors").delete().eq("id", id)
    if (error) throw error
  }

  async getBarges(params?: { competitorId?: string }): Promise<Barge[]> {
    let q = this.client().from("barges").select("*").order("name")
    if (params?.competitorId) q = q.eq("competitor_id", params.competitorId)
    const { data, error } = await q
    if (error) throw error
    return data as Barge[]
  }

  async upsertBarge(b: Partial<Barge> & { imo: string; name: string; competitor_id: string }): Promise<Barge> {
    const { data, error } = await this.client().from("barges").upsert(b, { onConflict: "organization_id,imo" }).select().single()
    if (error) throw error
    return data as Barge
  }

  async deleteBarge(id: string): Promise<void> {
    const { error } = await this.client().from("barges").delete().eq("id", id)
    if (error) throw error
  }

  async getVessel(params: { imo?: string; name?: string }): Promise<Vessel | null> {
    let q = this.client().from("vessels").select("*").limit(1)
    if (params.imo) q = q.eq("imo", params.imo)
    else if (params.name) q = q.eq("name", params.name)
    else return null
    const { data, error } = await q.maybeSingle()
    if (error) throw error
    return data as Vessel | null
  }

  async getSTSOperations(filters: Partial<STSFilters>): Promise<STSOperation[]> {
    let q = this.client().from("sts_operations").select("*").order("operation_date", { ascending: false })
    if (filters.dateFrom) q = q.gte("operation_date", filters.dateFrom)
    if (filters.dateTo) q = q.lte("operation_date", filters.dateTo)
    if (filters.competitorIds?.length) q = q.in("competitor_id", filters.competitorIds)
    if (filters.bargeIds?.length) q = q.in("barge_id", filters.bargeIds)
    if (filters.operationTypes?.length) q = q.in("operation_type", filters.operationTypes)
    if (filters.locations?.length) q = q.in("location", filters.locations)
    if (filters.receivingVesselQuery) {
      q = q.or(
        `receiving_vessel_name.ilike.%${filters.receivingVesselQuery}%,receiving_vessel_imo.ilike.%${filters.receivingVesselQuery}%`
      )
    }
    const { data, error } = await q
    if (error) throw error
    return data as STSOperation[]
  }

  async deleteOperationsByBarge(bargeId: string): Promise<void> {
    const { error } = await this.client().from("sts_operations").delete().eq("barge_id", bargeId)
    if (error) throw error
  }

  async importOperations(
    rows: Omit<STSOperation, "id" | "created_at" | "updated_at">[]
  ): Promise<{ imported: number; skippedDuplicates: number }> {
    // Deduplicate client-side against a deterministic fingerprint stored as
    // source_record_id when the source didn't provide one, then rely on the
    // unique constraint in schema.sql as the authoritative backstop.
    const withFingerprints = rows.map((r) => ({
      ...r,
      source_record_id:
        r.source_record_id ??
        fingerprintOperation({
          bargeImo: r.barge_imo,
          operationDate: r.operation_date,
          operationType: r.operation_type,
          receivingVesselImo: r.receiving_vessel_imo,
          location: r.location,
          startTime: r.start_time,
        }),
    }))

    const { data, error } = await this.client()
      .from("sts_operations")
      .upsert(withFingerprints, { onConflict: "organization_id,source_provider,source_record_id", ignoreDuplicates: true })
      .select("id")

    if (error) throw error
    const imported = data?.length ?? 0
    return { imported, skippedDuplicates: rows.length - imported }
  }

  async listImports(): Promise<DataImport[]> {
    const { data, error } = await this.client().from("data_imports").select("*").order("created_at", { ascending: false })
    if (error) throw error
    return data as DataImport[]
  }
}
