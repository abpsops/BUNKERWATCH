import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText, FileSpreadsheet, CheckCircle2, Plus, RotateCcw, X } from "lucide-react"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import BargeSTSUploadModal from "@/components/BargeSTSUploadModal"
import { isValidIMO, normalizeIMO } from "@/lib/imo"
import { formatDateDisplay } from "@/lib/dates"
import { exportToXlsx } from "@/lib/exportXlsx"
import { exportToPdf, buildPdfSummary, buildDateRangeLabel, buildPdfCompetitorLocationBreakdown } from "@/lib/exportPdf"
import { vesselIdentityKey } from "@/lib/anomalies"
import { nearestNamedLocation } from "@/services/data/shipTrackParser"
import { BARGES_SL, type BargesSlEntry } from "@/lib/bargesSl"
import type { Barge } from "@/types"

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ")
const makeCode = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 6) || "SL"

export default function BargesSL() {
  const provider = getDataProvider()
  const qc = useQueryClient()

  const [addImo, setAddImo] = useState<Record<string, string>>({})
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({})
  const [analysingBarge, setAnalysingBarge] = useState<Barge | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const { data: competitors = [] } = useQuery({ queryKey: ["competitors"], queryFn: () => provider.getCompetitors() })
  const { data: barges = [] } = useQuery({ queryKey: ["barges"], queryFn: () => provider.getBarges() })
  const { data: operations = [] } = useQuery({ queryKey: ["operations-all"], queryFn: () => provider.getSTSOperations({}) })

  const competitorName = (id: string) => competitors.find((c) => c.id === id)?.name ?? "—"

  // Match by IMO first (reliable), falling back to company + vessel name.
  const findBarge = (e: BargesSlEntry): Barge | undefined => {
    if (e.imo) {
      const byImo = barges.find((b) => normalizeIMO(b.imo) === e.imo)
      if (byImo) return byImo
    }
    return barges.find((b) => norm(b.name) === norm(e.vessel) && norm(competitorName(b.competitor_id)) === norm(e.company))
  }

  const bargeStats = (bargeId: string) => {
    const ops = operations.filter((o) => o.barge_id === bargeId && o.operation_type === "STS_BUNKERING")
    const latest = ops.length ? ops.reduce((m, o) => (o.operation_date > m ? o.operation_date : m), ops[0].operation_date) : null
    return { ops: ops.length, latest }
  }

  const removePendingFile = (bargeId: string) =>
    setPendingFiles((prev) => {
      const next = { ...prev }
      delete next[bargeId]
      return next
    })

  const addVessel = async (e: BargesSlEntry) => {
    const imo = e.imo ?? (addImo[e.vessel] ?? "").trim()
    if (!isValidIMO(imo)) return
    let competitor = competitors.find((c) => norm(c.name) === norm(e.company))
    if (!competitor) competitor = await provider.upsertCompetitor({ name: e.company, code: makeCode(e.company) })
    await provider.upsertBarge({ name: e.vessel, imo, competitor_id: competitor.id })
    qc.invalidateQueries({ queryKey: ["competitors"] })
    qc.invalidateQueries({ queryKey: ["barges"] })
  }

  const trackedBarges = BARGES_SL.map(findBarge).filter((b): b is Barge => !!b)
  const trackedIds = new Set(trackedBarges.map((b) => b.id))

  const clearBarge = async (b: Barge) => {
    const s = bargeStats(b.id)
    if (s.ops === 0 && !pendingFiles[b.id]) return
    if (!window.confirm(`Clear all analysed data for "${b.name}"? This deletes ${s.ops} bunkering event${s.ops === 1 ? "" : "s"} and cannot be undone.`)) return
    await provider.deleteOperationsByBarge(b.id)
    removePendingFile(b.id)
    qc.invalidateQueries({ queryKey: ["operations-all"] })
    qc.invalidateQueries({ queryKey: ["sts-analysis"] })
  }

  // Operations analysed before Sri Lankan ports were added were saved with
  // "Unknown" — re-derive the location from the stored lat/lon at report time
  // so old data doesn't need re-uploading. A garbled fix falls back to the
  // closest-in-time operation of the same barge that does resolve.
  const resolveLocation = (o: (typeof operations)[number]): string => {
    const known = (loc?: string | null) => !!loc && loc.trim() !== "" && loc.toLowerCase() !== "unknown"
    // Coordinates win over any saved label, so a stale or wrong saved
    // location (e.g. FUJ / KFK) can never override where the barge actually was.
    const hasCoords = o.latitude != null && o.longitude != null && !(Number(o.latitude) === 0 && Number(o.longitude) === 0)
    if (hasCoords) {
      const fromCoords = nearestNamedLocation(Number(o.latitude), Number(o.longitude))
      if (fromCoords !== "Unknown") return fromCoords
    }
    if (known(o.location)) return o.location as string
    const t = new Date(`${o.operation_date}T${o.start_time ?? "00:00"}`).getTime()
    let best: { loc: string; d: number } | null = null
    for (const other of operations) {
      if (other.barge_id !== o.barge_id || other.id === o.id) continue
      const otherCoords = other.latitude != null && other.longitude != null ? nearestNamedLocation(Number(other.latitude), Number(other.longitude)) : "Unknown"
      const loc = otherCoords !== "Unknown" ? otherCoords : known(other.location) ? (other.location as string) : "Unknown"
      if (loc === "Unknown") continue
      const d = Math.abs(new Date(`${other.operation_date}T${other.start_time ?? "00:00"}`).getTime() - t)
      if (!best || d < best.d) best = { loc, d }
    }
    return best ? best.loc : "Unknown"
  }

  const header = ["#", "Competitor", "Barge", "Barge IMO", "Vessel", "Date", "Time", "Location"]

  const downloadVesselPdf = (b: Barge) => {
    const rows = operations
      .filter((o) => o.barge_id === b.id && o.operation_type === "STS_BUNKERING")
      .map((o) => ({ ...o, location: resolveLocation(o) }))
      .sort((a, c) => `${a.operation_date} ${a.start_time ?? ""}`.localeCompare(`${c.operation_date} ${c.start_time ?? ""}`))
    exportToPdf(
      `bunkerwatch_barges_sl_${b.name.replace(/\s+/g, "_").toLowerCase()}.pdf`,
      `BUNKERWATCH — BARGES -SL — ${b.name}`,
      header,
      rows.map((o, i) => [i + 1, competitorName(b.competitor_id), b.name, b.imo, o.receiving_vessel_name, formatDateDisplay(o.operation_date), o.start_time ?? "", o.location ?? ""]),
      { dateRangeLabel: buildDateRangeLabel(rows.map((o) => o.operation_date), formatDateDisplay), firstColumnIsRowNumber: true }
    )
  }

  const excelRow = (o: (typeof operations)[number], b: Barge | undefined, i: number) => ({
    "#": i + 1,
    Competitor: b ? competitorName(b.competitor_id) : o.competitor_name,
    Barge: b ? b.name : o.barge_name,
    "Barge IMO": b ? b.imo : o.barge_imo,
    Vessel: o.receiving_vessel_name,
    Date: formatDateDisplay(o.operation_date),
    Time: o.start_time ?? "",
    Location: o.location ?? "",
  })

  const downloadVesselExcel = (b: Barge) => {
    const rows = operations
      .filter((o) => o.barge_id === b.id && o.operation_type === "STS_BUNKERING")
      .map((o) => ({ ...o, location: resolveLocation(o) }))
      .sort((a, c) => `${a.operation_date} ${a.start_time ?? ""}`.localeCompare(`${c.operation_date} ${c.start_time ?? ""}`))
    exportToXlsx(
      `bunkerwatch_barges_sl_${b.name.replace(/\s+/g, "_").toLowerCase()}.xlsx`,
      b.name.slice(0, 31),
      rows.map((o, i) => excelRow(o, b, i))
    )
  }

  const downloadAllExcel = () => {
    const rows = operations
      .filter((o) => o.operation_type === "STS_BUNKERING" && trackedIds.has(o.barge_id))
      .map((o) => ({ ...o, location: resolveLocation(o) }))
      .sort((a, b) => {
        if (a.competitor_name !== b.competitor_name) return a.competitor_name < b.competitor_name ? -1 : 1
        if (a.barge_name !== b.barge_name) return a.barge_name < b.barge_name ? -1 : 1
        if (a.barge_id !== b.barge_id) return a.barge_id < b.barge_id ? -1 : 1
        return `${a.operation_date} ${a.start_time ?? ""}`.localeCompare(`${b.operation_date} ${b.start_time ?? ""}`)
      })
    exportToXlsx("bunkerwatch_barges_sl_all.xlsx", "BARGES -SL", rows.map((o, i) => excelRow(o, undefined, i)))
  }

  const downloadAllPdf = () => {
    const rows = operations
      .filter((o) => o.operation_type === "STS_BUNKERING" && trackedIds.has(o.barge_id))
      .map((o) => ({ ...o, location: resolveLocation(o) }))
      .sort((a, b) => {
        if (a.competitor_name !== b.competitor_name) return a.competitor_name < b.competitor_name ? -1 : 1
        if (a.barge_name !== b.barge_name) return a.barge_name < b.barge_name ? -1 : 1
        if (a.barge_id !== b.barge_id) return a.barge_id < b.barge_id ? -1 : 1
        return `${a.operation_date} ${a.start_time ?? ""}`.localeCompare(`${b.operation_date} ${b.start_time ?? ""}`)
      })
    const byCompetitor = buildPdfSummary(rows, (o) => o.competitor_name, vesselIdentityKey)
    const byLocation = buildPdfSummary(rows, (o) => o.location || "Unknown", vesselIdentityKey)
    const byCompetitorLocation = buildPdfCompetitorLocationBreakdown(rows, (o) => o.competitor_name, (o) => o.location || "Unknown", vesselIdentityKey)
    const groupBreakAfterRows = rows
      .map((o, i) => (i < rows.length - 1 && o.barge_id !== rows[i + 1].barge_id ? i : -1))
      .filter((i) => i >= 0)
    exportToPdf(
      "bunkerwatch_barges_sl_all.pdf",
      "BUNKERWATCH — BARGES -SL — BUNKERING OPS",
      header,
      rows.map((o, i) => [i + 1, o.competitor_name, o.barge_name, o.barge_imo, o.receiving_vessel_name, formatDateDisplay(o.operation_date), o.start_time ?? "", o.location ?? ""]),
      {
        dateRangeLabel: buildDateRangeLabel(rows.map((o) => o.operation_date), formatDateDisplay),
        groupBreakAfterRows,
        firstColumnIsRowNumber: true,
        summary: {
          byCompetitor: byCompetitor.rows,
          byLocation: byLocation.rows,
          byCompetitorLocation,
          totalOperations: byCompetitor.totalOperations,
          totalVessels: byCompetitor.totalVessels,
        },
      }
    )
  }

  return (
    <div>
      <PageHeader
        title="BARGES -SL"
        subtitle="Sri Lanka barge watchlist — upload each vessel's export, Analyse to extract Bunkering events, then Report to PDF."
        actions={
          <div className="flex items-center gap-2">
          <button
            onClick={downloadAllExcel}
            disabled={trackedBarges.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-vivid-green text-white shadow-sm hover:brightness-110 transition-all px-3 py-1.5 text-xs font-medium focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={13} /> Download All (Excel)
          </button>
          <button
            onClick={downloadAllPdf}
            disabled={trackedBarges.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-vivid-blue px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:brightness-110 transition-all focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText size={13} /> Download All (PDF)
          </button>
          </div>
        }
      />

      <div className="px-6">
        <div className="rounded-xl glass overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs font-medium text-paper-500">
                <th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Vessel</th>
                <th className="px-4 py-2.5">IMO</th>
                <th className="px-4 py-2.5">LOC / Coverage</th>
                <th className="px-4 py-2.5 text-right">Bunkering Events</th>
                <th className="px-4 py-2.5">Last Activity</th>
                <th className="px-4 py-2.5">STS Data</th>
                <th className="px-4 py-2.5">Report</th>
              </tr>
            </thead>
            <tbody>
              {BARGES_SL.map((e) => {
                const b = findBarge(e)
                if (!b) {
                  const imoVal = e.imo ?? addImo[e.vessel] ?? ""
                  return (
                    <tr key={e.vessel} className="border-b border-ink-800">
                      <td className="px-4 py-2.5 text-paper-300">{e.company}</td>
                      <td className="px-4 py-2.5">{e.vessel}</td>
                      <td className="px-4 py-2.5">
                        {e.imo ? (
                          <span className="font-mono text-paper-500">{e.imo}</span>
                        ) : (
                          <input
                            value={addImo[e.vessel] ?? ""}
                            onChange={(ev) => setAddImo((prev) => ({ ...prev, [e.vessel]: ev.target.value }))}
                            placeholder="IMO (not verified)"
                            className={`bg-ink-800 border rounded-md px-2 py-1 text-xs font-mono w-32 ${imoVal && !isValidIMO(imoVal) ? "border-signal-crit/60" : "border-ink-600"}`}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-paper-500">{e.coverage}</td>
                      <td className="px-4 py-2.5 text-right text-paper-500 text-xs">Not tracked yet</td>
                      <td className="px-4 py-2.5" />
                      <td className="px-4 py-2.5" colSpan={2}>
                        <button
                          onClick={() => addVessel(e)}
                          disabled={!isValidIMO(imoVal)}
                          className="flex items-center gap-1.5 rounded-md bg-vivid-purple text-white shadow-sm hover:brightness-110 transition-all px-2.5 py-1 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Plus size={12} /> Add to Tracker
                        </button>
                      </td>
                    </tr>
                  )
                }
                const s = bargeStats(b.id)
                const pendingFile = pendingFiles[b.id]
                return (
                  <tr key={e.vessel} className="border-b border-ink-800 hover:bg-ink-800/60 transition-colors">
                    <td className="px-4 py-2.5 text-paper-300">{e.company}</td>
                    <td className="px-4 py-2.5">{b.name}</td>
                    <td className="px-4 py-2.5 font-mono text-paper-500">{b.imo}</td>
                    <td className="px-4 py-2.5 text-xs text-paper-500">{e.coverage}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{s.ops}</td>
                    <td className="px-4 py-2.5 text-xs text-paper-500">{s.latest ? formatDateDisplay(s.latest) : "N/A"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          ref={(el) => { fileInputRefs.current[b.id] = el }}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={(ev) => ev.target.files?.[0] && setPendingFiles((prev) => ({ ...prev, [b.id]: ev.target.files![0] }))}
                        />
                        <button
                          onClick={() => fileInputRefs.current[b.id]?.click()}
                          className="rounded-md border border-vivid-cyan/50 text-vivid-cyan px-2.5 py-1 text-xs font-medium hover:bg-vivid-cyan-tint transition-colors focus-ring"
                        >
                          Upload
                        </button>
                        <button
                          onClick={() => pendingFile && setAnalysingBarge(b)}
                          disabled={!pendingFile}
                          className="rounded-md bg-vivid-teal text-white shadow-sm hover:brightness-110 transition-all px-2.5 py-1 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Analyse
                        </button>
                        {pendingFile && (
                          <span className="flex items-center gap-1 text-[11px] text-signal-ok max-w-[110px] truncate" title={pendingFile.name}>
                            <CheckCircle2 size={12} className="shrink-0" /> {pendingFile.name}
                            <button onClick={() => removePendingFile(b.id)} title="Remove this file" className="text-paper-500 hover:text-signal-crit focus-ring shrink-0">
                              <X size={11} />
                            </button>
                          </span>
                        )}
                        <button
                          onClick={() => clearBarge(b)}
                          disabled={s.ops === 0 && !pendingFile}
                          title="Reset this vessel's analysed data back to 0"
                          className="ml-auto flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs text-paper-500 hover:border-signal-crit/40 hover:text-signal-crit focus-ring disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <RotateCcw size={11} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => downloadVesselPdf(b)}
                        disabled={s.ops === 0}
                        title={s.ops === 0 ? "Analyse a file first" : `Report ${b.name} to PDF`}
                        className="flex items-center gap-1.5 rounded-md bg-vivid-blue text-white shadow-sm hover:brightness-110 transition-all px-2.5 py-1 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <FileText size={12} /> Report (PDF)
                      </button>
                      <button
                        onClick={() => downloadVesselExcel(b)}
                        disabled={s.ops === 0}
                        title={s.ops === 0 ? "Analyse a file first" : `Report ${b.name} to Excel`}
                        className="flex items-center gap-1.5 rounded-md bg-vivid-green text-white shadow-sm hover:brightness-110 transition-all px-2.5 py-1 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <FileSpreadsheet size={12} /> Report (Excel)
                      </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {analysingBarge && pendingFiles[analysingBarge.id] && (
        <BargeSTSUploadModal
          barge={analysingBarge}
          competitorName={competitorName(analysingBarge.competitor_id)}
          initialFile={pendingFiles[analysingBarge.id]}
          onClose={() => setAnalysingBarge(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["operations-all"] })
            qc.invalidateQueries({ queryKey: ["sts-analysis"] })
            setPendingFiles((prev) => {
              const next = { ...prev }
              delete next[analysingBarge.id]
              return next
            })
          }}
        />
      )}
    </div>
  )
}
