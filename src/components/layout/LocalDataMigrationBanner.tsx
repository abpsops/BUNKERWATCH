import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CloudUpload, Download, X } from "lucide-react"
import { getDataProvider } from "@/services/data"
import {
  readDemoStore,
  isMigrated,
  markMigrated,
  migrateDemoStore,
  downloadDemoBackup,
  type MigrationSummary,
} from "@/lib/localDataMigration"

/**
 * Shown once, on the device where the app previously ran in demo mode, when
 * the backend is live and that browser still holds un-migrated local data.
 */
export default function LocalDataMigrationBanner() {
  const provider = getDataProvider()
  const qc = useQueryClient()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<MigrationSummary | null>(null)

  if (provider.isDemo || dismissed) return null
  const store = readDemoStore()
  if (!store) return null
  const hasData = store.barges.length + store.vessels.length + store.operations.length > 0
  if (!hasData || (isMigrated() && !done)) return null

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const summary = await migrateDemoStore(store, provider, setProgress)
      markMigrated()
      setDone(summary)
      await qc.invalidateQueries()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-4 mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-slate-900">
      {done ? (
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="font-semibold">Local data moved to the cloud</div>
            <div className="mt-1 text-xs text-slate-700">
              {done.competitorsAdded} competitors, {done.bargesAdded} barges and {done.vesselsAdded} vessels added;{" "}
              {done.operationsImported} operations imported ({done.operationsDuplicate} already present
              {done.operationsSkipped ? `, ${done.operationsSkipped} skipped` : ""}).
              {done.bargesSkipped.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">{done.bargesSkipped.length} barges could not be added</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {done.bargesSkipped.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
          <button onClick={() => setDismissed(true)} className="p-1 text-ink-500 hover:text-slate-900" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[16rem]">
            <div className="font-semibold">Data from this browser found</div>
            <div className="text-xs text-slate-700">
              {store.competitors.length} competitors, {store.barges.length} barges, {store.vessels.length} vessels and{" "}
              {store.operations.length} operations were saved here before the app was connected to the cloud. Import them
              so they show on every device.
            </div>
            {busy && <div className="mt-1 text-xs text-slate-600">{progress}</div>}
            {error && <div className="mt-1 text-xs text-red-700">Import failed: {error}</div>}
          </div>
          <button
            onClick={downloadDemoBackup}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            <Download size={14} /> Backup
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md bg-navy-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-800 disabled:opacity-60"
          >
            <CloudUpload size={14} /> {busy ? "Importing…" : "Import to cloud"}
          </button>
          <button onClick={() => setDismissed(true)} className="p-1 text-ink-500 hover:text-slate-900" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
