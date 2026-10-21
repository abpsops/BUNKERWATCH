import type { Barge, Competitor, STSOperation, Vessel } from "@/types"
import type { MaritimeDataProvider } from "@/services/data"
import { supabase } from "@/services/supabase/client"

/**
 * Before the app was connected to Supabase it ran in Demo mode, where every
 * competitor, barge, vessel and STS operation the user entered was persisted
 * in the browser under this localStorage key. This module finds that data
 * and copies it into the cloud database so nothing entered in demo mode is
 * lost when the real backend comes online.
 */
export const DEMO_STORAGE_KEY = "bunkerwatch_demo_v1"
export const MIGRATED_FLAG_KEY = "bunkerwatch_demo_migrated_v1"

export interface DemoStore {
  competitors: Competitor[]
  barges: Barge[]
  vessels: Vessel[]
  operations: STSOperation[]
}

export interface MigrationSummary {
  competitorsAdded: number
  bargesAdded: number
  bargesSkipped: string[] // "name (imo): reason"
  vesselsAdded: number
  operationsImported: number
  operationsDuplicate: number
  operationsSkipped: number
}

export function readDemoStore(): DemoStore | null {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return {
      competitors: Array.isArray(s.competitors) ? s.competitors : [],
      barges: Array.isArray(s.barges) ? s.barges : [],
      vessels: Array.isArray(s.vessels) ? s.vessels : [],
      operations: Array.isArray(s.operations) ? s.operations : [],
    }
  } catch {
    return null
  }
}

export function isMigrated(): boolean {
  try {
    return !!localStorage.getItem(MIGRATED_FLAG_KEY)
  } catch {
    return false
  }
}

export function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_FLAG_KEY, new Date().toISOString())
  } catch {
    // ignore
  }
}

export function downloadDemoBackup() {
  const raw = localStorage.getItem(DEMO_STORAGE_KEY) ?? "{}"
  const blob = new Blob([raw], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `bunkerwatch-local-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ")
const validImo = (imo: string | null | undefined) => /^\d{7}$/.test((imo ?? "").trim())

/**
 * Copies the demo store into the backend. Idempotent: competitors are matched
 * by code (then name), barges and vessels by IMO, operations by their source
 * fingerprint, so running it twice adds nothing the second time.
 */
export async function migrateDemoStore(
  store: DemoStore,
  provider: MaritimeDataProvider,
  onProgress?: (msg: string) => void
): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    competitorsAdded: 0,
    bargesAdded: 0,
    bargesSkipped: [],
    vesselsAdded: 0,
    operationsImported: 0,
    operationsDuplicate: 0,
    operationsSkipped: 0,
  }

  // ---- Competitors --------------------------------------------------------
  onProgress?.("Matching competitors…")
  const existingComps = await provider.getCompetitors()
  const compByCode = new Map(existingComps.map((c) => [norm(c.code), c]))
  const compByName = new Map(existingComps.map((c) => [norm(c.name), c]))
  const compIdMap = new Map<string, string>() // demo id -> cloud id

  for (const c of store.competitors) {
    const found = compByCode.get(norm(c.code)) ?? compByName.get(norm(c.name))
    if (found) {
      compIdMap.set(c.id, found.id)
      continue
    }
    const created = await provider.upsertCompetitor({
      name: c.name,
      code: c.code || norm(c.name).slice(0, 8),
      description: c.description ?? null,
      active: c.active ?? true,
    })
    compIdMap.set(c.id, created.id)
    compByCode.set(norm(created.code), created)
    compByName.set(norm(created.name), created)
    summary.competitorsAdded++
  }

  // ---- Barges -------------------------------------------------------------
  onProgress?.("Matching barges…")
  const existingBarges = await provider.getBarges()
  const bargeByImo = new Map(existingBarges.map((b) => [b.imo.trim(), b]))
  const bargeIdMap = new Map<string, string>()

  for (const b of store.barges) {
    const imo = (b.imo ?? "").trim()
    const found = validImo(imo) ? bargeByImo.get(imo) : undefined
    if (found) {
      bargeIdMap.set(b.id, found.id)
      continue
    }
    if (!validImo(imo)) {
      summary.bargesSkipped.push(`${b.name} (${imo || "no IMO"}): IMO must be 7 digits`)
      continue
    }
    const competitor_id = compIdMap.get(b.competitor_id)
    if (!competitor_id) {
      summary.bargesSkipped.push(`${b.name} (${imo}): competitor not found`)
      continue
    }
    try {
      const created = await provider.upsertBarge({
        competitor_id,
        name: b.name,
        imo,
        mmsi: b.mmsi ?? null,
        call_sign: b.call_sign ?? null,
        flag: b.flag ?? null,
        vessel_type: b.vessel_type ?? null,
        dwt: b.dwt ?? null,
        loa: b.loa ?? null,
        active: b.active ?? true,
        notes: b.notes ?? null,
      })
      bargeIdMap.set(b.id, created.id)
      bargeByImo.set(imo, created)
      summary.bargesAdded++
    } catch (e) {
      summary.bargesSkipped.push(`${b.name} (${imo}): ${(e as Error).message}`)
    }
  }

  // ---- Vessels (shared table, keyed by IMO) --------------------------------
  onProgress?.("Copying vessels…")
  const vesselIdMap = new Map<string, string>()
  if (supabase && store.vessels.length) {
    const rows = store.vessels
      .filter((v) => validImo(v.imo))
      .map((v) => ({
        imo: v.imo.trim(),
        mmsi: v.mmsi ?? null,
        name: v.name,
        vessel_type: v.vessel_type ?? null,
        flag: v.flag ?? null,
        dwt: v.dwt ?? null,
        loa: v.loa ?? null,
        call_sign: v.call_sign ?? null,
      }))
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { data, error } = await supabase.from("vessels").upsert(chunk, { onConflict: "imo" }).select("id,imo")
      if (error) throw error
      const byImo = new Map((data ?? []).map((r: { id: string; imo: string }) => [r.imo, r.id]))
      for (const v of store.vessels) {
        const id = byImo.get(v.imo?.trim())
        if (id) vesselIdMap.set(v.id, id)
      }
      summary.vesselsAdded += data?.length ?? 0
    }
  }

  // ---- STS operations -----------------------------------------------------
  onProgress?.(`Importing ${store.operations.length} operations…`)
  type OpRow = Omit<STSOperation, "id" | "created_at" | "updated_at">
  const opRows: OpRow[] = []
  for (const o of store.operations) {
    const barge_id = bargeIdMap.get(o.barge_id)
    const competitor_id = compIdMap.get(o.competitor_id)
    if (!barge_id || !competitor_id) {
      summary.operationsSkipped++
      continue
    }
    // organization_id is deliberately omitted: the column default fills it
    // with current_org_id() so RLS accepts the row.
    const { id: _id, created_at: _c, updated_at: _u, organization_id: _org, ...rest } = o
    void _id; void _c; void _u; void _org
    opRows.push({
      ...rest,
      barge_id,
      competitor_id,
      receiving_vessel_id: o.receiving_vessel_id ? (vesselIdMap.get(o.receiving_vessel_id) ?? null) : null,
      source_provider: o.source_provider || "demo-migration",
    } as OpRow)
  }
  for (let i = 0; i < opRows.length; i += 500) {
    const res = await provider.importOperations(opRows.slice(i, i + 500))
    summary.operationsImported += res.imported
    summary.operationsDuplicate += res.skippedDuplicates
    onProgress?.(`Imported ${summary.operationsImported} of ${opRows.length} operations…`)
  }

  return summary
}
