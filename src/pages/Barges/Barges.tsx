import { Fragment, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { Plus, X, AlertTriangle, FileSpreadsheet, FileText, CheckCircle2, RotateCcw } from "lucide-react"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import { isValidIMO } from "@/lib/imo"
import { formatDateDisplay } from "@/lib/dates"
import BargeSTSUploadModal from "@/components/BargeSTSUploadModal"
import { exportToXlsx } from "@/lib/exportXlsx"
import { exportToPdf, buildPdfSummary, buildDateRangeLabel, buildPdfCompetitorLocationBreakdown } from "@/lib/exportPdf"
import { findOperationAnomalies, findOperationAnomalyDetails, vesselIdentityKey } from "@/lib/anomalies"
import { REGION_ORDER, REGION_LABELS, regionForBargeOperations, type BargeRegion } from "@/lib/regions"
import type { Barge } from "@/types"

export default function Barges() {
  const provider = getDataProvider()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get("highlight")
  const [showBulk, setShowBulk] = useState(false)
  const [competitorId, setCompetitorId] = useState("")
  const [bulkText, setBulkText] = useState("")
  const [namePrefix, setNamePrefix] = useState("Barge")

  // Per-barge: the file attached via "Upload" but not yet analysed.
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({})
  // Which barge's Analyse modal is currently open.
  const [analysingBarge, setAnalysingBarge] = useState<Barge | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  const { data: competitors = [] } = useQuery({ queryKey: ["competitors"], queryFn: () => provider.getCompetitors() })
  const { data: barges = [] } = useQuery({ queryKey: ["barges"], queryFn: () => provider.getBarges() })
  const { data: operations = [] } = useQuery({ queryKey: ["operations-all"], queryFn: () => provider.getSTSOperations({}) })

  // Grouped FUJ -> KFK -> OMAN -> no-location-data-yet. A barge's region
  // is derived from its own operations (location lives on the operation,
  // not the barge), so this naturally updates as more data is analysed.
  // Within each region, barges keep their original relative order.
  const regionSortedBarges = REGION_ORDER.flatMap((region) =>
    barges
      .filter((b) => regionForBargeOperations(operations.filter((o) => o.barge_id === b.id)) === region)
      .map((b) => ({ barge: b, region }))
  )

  const competitorName = (id: string) => competitors.find((c) => c.id === id)?.name ?? "—"

  // Grouped by COMPETITOR first, then by barge within that competitor, so
  // every barge belonging to e.g. OMTI sits in one contiguous block — never
  // split apart by another competitor's barge landing alphabetically
  // between two of OMTI's barge names. Chronological within each barge
  // (date, then time) so consecutive-operation gap checks read correctly.
  const allBunkeringRows = () =>
    operations
      .filter((o) => o.operation_type === "STS_BUNKERING")
      .slice()
      .sort((a, b) => {
        if (a.competitor_name !== b.competitor_name) return a.competitor_name < b.competitor_name ? -1 : 1
        if (a.barge_name !== b.barge_name) return a.barge_name < b.barge_name ? -1 : 1
        if (a.barge_id !== b.barge_id) return a.barge_id < b.barge_id ? -1 : 1
        const aKey = `${a.operation_date} ${a.start_time ?? ""}`
        const bKey = `${b.operation_date} ${b.start_time ?? ""}`
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
      })

  const downloadExcel = () => {
    exportToXlsx(
      "bunkerwatch_all_barges_sts_bunkering.xlsx",
      "STS Bunkering",
      allBunkeringRows().map((o) => ({
        Competitor: o.competitor_name,
        Barge: o.barge_name,
        "Barge IMO": o.barge_imo,
        Vessel: o.receiving_vessel_name,
        Date: o.operation_date,
        Time: o.start_time ?? "",
        Location: o.location ?? "",
      }))
    )
  }

  const downloadPdf = () => {
    const rows = allBunkeringRows()
    const byCompetitor = buildPdfSummary(rows, (o) => o.competitor_name, vesselIdentityKey)
    const byLocation = buildPdfSummary(rows, (o) => o.location || "Unknown", vesselIdentityKey)
    const byCompetitorLocation = buildPdfCompetitorLocationBreakdown(
      rows,
      (o) => o.competitor_name,
      (o) => o.location || "Unknown",
      vesselIdentityKey
    )
    const dateRangeLabel = buildDateRangeLabel(
      rows.map((o) => o.operation_date),
      formatDateDisplay
    )
    // A separator line is drawn under the last row of each barge's block of
    // entries (rows are already sorted by competitor, then barge), so one
    // barge's operations are visually set off from the next.
    const groupBreakAfterRows = rows
      .map((o, i) => (i < rows.length - 1 && o.barge_id !== rows[i + 1].barge_id ? i : -1))
      .filter((i) => i >= 0)
    // Flag operations less than 5 hours apart on either a shared barge
    // (different vessel) or a shared vessel (different barge) — neither
    // is physically plausible that fast, so likely spoofed/bad data. The
    // only exemption is the SAME barge servicing the SAME vessel within
    // 5 hours, which is normal multi-grade bunkering (e.g. VLSFO then
    // MGO back to back). Same rule used live on this page's table (see
    // the anomaly count per barge below).
    const flaggedRows = Array.from(findOperationAnomalies(rows))
    // Plain-language explanation for each flagged pair, shown on its own
    // page in the PDF right after the main table — row numbers below are
    // 1-based to match the S.No. column (index + 1).
    const anomalyExplanations = findOperationAnomalyDetails(rows).map((d) => ({
      rowNumbers: [d.indices[0] + 1, d.indices[1] + 1] as [number, number],
      gapLabel: d.gapLabel,
      summary: d.summary,
    }))

    exportToPdf(
      "bunkerwatch_all_barges_sts_bunkering.pdf",
      "BUNKERWATCH — TRACKED BUNKERING OPS",
      ["#", "Competitor", "Barge", "Barge IMO", "Vessel", "Date", "Time", "Location"],
      rows.map((o, i) => [
        i + 1,
        o.competitor_name,
        o.barge_name,
        o.barge_imo,
        o.receiving_vessel_name,
        formatDateDisplay(o.operation_date),
        o.start_time ?? "",
        o.location ?? "",
      ]),
      {
        dateRangeLabel,
        groupBreakAfterRows,
        flaggedRows,
        firstColumnIsRowNumber: true,
        anomalyExplanations,
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

  const parsedLines = bulkText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  const validImos = parsedLines.filter(isValidIMO)
  const invalidImos = parsedLines.filter((l) => !isValidIMO(l))

  const submitBulk = async () => {
    if (!competitorId || validImos.length === 0) return
    for (let i = 0; i < validImos.length; i++) {
      await provider.upsertBarge({
        imo: validImos[i],
        name: `${namePrefix} ${i + 1}`,
        competitor_id: competitorId,
      })
    }
    setBulkText("")
    setShowBulk(false)
    qc.invalidateQueries({ queryKey: ["barges"] })
  }

  const remove = async (id: string) => {
    await provider.deleteBarge(id)
    qc.invalidateQueries({ queryKey: ["barges"] })
  }

  // Computed once across ALL operations (the anomaly rule looks at a
  // barge's full chronological history, not just what's visible per row),
  // then looked up per barge below — same 5-hour/different-vessel rule
  // used in the PDF export, now surfaced live as you upload/analyse.
  const anomalyOpIds = new Set(
    Array.from(findOperationAnomalies(operations)).map((i) => operations[i].id)
  )

  const bargeStats = (bargeId: string) => {
    const ops = operations.filter((o) => o.barge_id === bargeId)
    const uniqueVessels = new Set(ops.map(vesselIdentityKey)).size
    const latest = ops.length ? ops.reduce((m, o) => (o.operation_date > m ? o.operation_date : m), ops[0].operation_date) : null
    const anomalies = ops.filter((o) => anomalyOpIds.has(o.id)).length
    return { ops: ops.length, uniqueVessels, latest, anomalies }
  }

  // Arriving here via a global-search click on a barge/event carries
  // ?highlight=<bargeId> — scroll that row into view and give it a
  // temporary highlight, then clear the param so a page refresh doesn't
  // keep re-highlighting it forever.
  useEffect(() => {
    if (!highlightId) return
    const row = rowRefs.current[highlightId]
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" })
    const t = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete("highlight")
        return next
      }, { replace: true })
    }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, barges.length])

  const onAttachFile = (bargeId: string, file: File) => {
    setPendingFiles((prev) => ({ ...prev, [bargeId]: file }))
  }

  // Resets a single barge's analyser back to zero: deletes every imported
  // STS operation tied to it and clears any file staged but not yet
  // analysed. The barge record itself (name, IMO, competitor) is untouched.
  const clearBarge = async (b: Barge) => {
    const s = bargeStats(b.id)
    const hasPending = !!pendingFiles[b.id]
    if (s.ops === 0 && !hasPending) return
    const confirmed = window.confirm(
      `Clear all analysed data for "${b.name}"? This deletes ${s.ops} bunkering event${s.ops === 1 ? "" : "s"} imported for this barge and cannot be undone.`
    )
    if (!confirmed) return
    await provider.deleteOperationsByBarge(b.id)
    setPendingFiles((prev) => {
      const next = { ...prev }
      delete next[b.id]
      return next
    })
    qc.invalidateQueries({ queryKey: ["operations-all"] })
    qc.invalidateQueries({ queryKey: ["sts-analysis"] })
  }

  // Resets EVERY barge's analyser back to zero in one action: deletes all
  // imported STS operations across all barges and clears any files staged
  // but not yet analysed. Barge records themselves are untouched.
  const clearAllBarges = async () => {
    const totalOps = operations.filter((o) => o.operation_type === "STS_BUNKERING").length
    if (totalOps === 0 && Object.keys(pendingFiles).length === 0) return
    const confirmed = window.confirm(
      `Clear ALL analysed data for every barge? This deletes ${totalOps} bunkering event${totalOps === 1 ? "" : "s"} across all ${barges.length} barges and cannot be undone.`
    )
    if (!confirmed) return
    await Promise.all(barges.map((b) => provider.deleteOperationsByBarge(b.id)))
    setPendingFiles({})
    qc.invalidateQueries({ queryKey: ["operations-all"] })
    qc.invalidateQueries({ queryKey: ["sts-analysis"] })
  }

  return (
    <div>
      <PageHeader
        title="Barges"
        subtitle="Upload each barge's STS export, then Analyse to sort and extract Bunkering events."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={downloadExcel}
              className="flex items-center gap-1.5 rounded-md bg-vivid-green px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:brightness-110 transition-all focus-ring"
            >
              <FileSpreadsheet size={13} /> Download All (Excel)
            </button>
            <button
              onClick={downloadPdf}
              className="flex items-center gap-1.5 rounded-md bg-vivid-blue px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:brightness-110 transition-all focus-ring"
            >
              <FileText size={13} /> Download All (PDF)
            </button>
            <button
              onClick={clearAllBarges}
              title="Reset every barge's analysed data back to 0"
              className="flex items-center gap-1.5 rounded-md border border-vivid-red/40 text-vivid-red px-3 py-1.5 text-xs hover:bg-vivid-red-tint transition-colors focus-ring"
            >
              <RotateCcw size={13} /> Clear All
            </button>
            <button
              onClick={() => setShowBulk((s) => !s)}
              className="flex items-center gap-1.5 rounded-md bg-vivid-purple px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:brightness-110 transition-all focus-ring"
            >
              <Plus size={13} /> Bulk Add Barges
            </button>
          </div>
        }
      />

      <div className="px-6">
        {showBulk && (
          <div className="mb-4 rounded-xl glass p-4 space-y-3">
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-xs font-medium text-paper-500 mb-1">
                  Competitor
                </label>
                <select
                  value={competitorId}
                  onChange={(e) => setCompetitorId(e.target.value)}
                  className="bg-ink-800 border border-ink-600 rounded-md px-2 py-1.5 text-sm min-w-[200px]"
                >
                  <option value="">Select competitor…</option>
                  {competitors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-paper-500 mb-1">
                  Name prefix
                </label>
                <input
                  value={namePrefix}
                  onChange={(e) => setNamePrefix(e.target.value)}
                  className="bg-ink-800 border border-ink-600 rounded-md px-2 py-1.5 text-sm w-32"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-paper-500 mb-1">
                Paste IMO numbers — one per line
              </label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={6}
                placeholder={"9876543\n1234567\n2345678"}
                className="w-full bg-ink-800 border border-ink-600 rounded-md px-2 py-1.5 text-sm font-mono"
              />
            </div>

            {parsedLines.length > 0 && (
              <div className="text-xs flex items-center gap-4">
                <span className="text-signal-ok">{validImos.length} valid</span>
                {invalidImos.length > 0 && (
                  <span className="text-signal-crit flex items-center gap-1">
                    <AlertTriangle size={12} /> {invalidImos.length} failed check-digit validation
                  </span>
                )}
              </div>
            )}

            <button
              onClick={submitBulk}
              disabled={!competitorId || validImos.length === 0}
              className="rounded-md bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm hover:shadow-md transition-shadow px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              Add {validImos.length || ""} Barges
            </button>
          </div>
        )}

        <div className="rounded-xl glass overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs font-medium text-paper-500">
                <th className="px-4 py-2.5">Competitor</th>
                <th className="px-4 py-2.5">Barge</th>
                <th className="px-4 py-2.5">IMO</th>
                <th className="px-4 py-2.5 text-right">Bunkering Events</th>
                <th className="px-4 py-2.5">Last Activity</th>
                <th className="px-4 py-2.5">STS Data</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {regionSortedBarges.map(({ barge: b, region }, i) => {
                const s = bargeStats(b.id)
                const pendingFile = pendingFiles[b.id]
                const showRegionHeader = i === 0 || regionSortedBarges[i - 1].region !== region
                return (
                  <Fragment key={b.id}>
                    {showRegionHeader && (
                      <tr key={`region-${region}`} className="bg-ink-900/60">
                        <td colSpan={7} className="px-4 py-1.5 text-[11px] font-semibold tracking-wide text-paper-300">
                          {REGION_LABELS[region]}
                        </td>
                      </tr>
                    )}
                    <tr
                      ref={(el) => { rowRefs.current[b.id] = el }}
                      className={`border-b border-ink-800 hover:bg-ink-800/60 transition-colors ${
                        highlightId === b.id ? "bg-signal-warn/10 ring-1 ring-inset ring-signal-warn/40" : ""
                      }`}
                    >
                    <td className="px-4 py-2.5 text-paper-300">{competitorName(b.competitor_id)}</td>
                    <td className="px-4 py-2.5">{b.name}</td>
                    <td className="px-4 py-2.5 font-mono text-paper-500">{b.imo}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.ops}
                        {s.anomalies > 0 && (
                          <span
                            title={`${s.anomalies} operation${s.anomalies === 1 ? "" : "s"} flagged: less than 5 hours since a related operation on a different barge or vessel`}
                            className="flex items-center gap-0.5 rounded-full bg-signal-crit/10 text-signal-crit px-1.5 py-0.5 text-[10px] font-sans font-medium cursor-help"
                          >
                            <AlertTriangle size={10} /> {s.anomalies}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-paper-500">{s.latest ? formatDateDisplay(s.latest) : "N/A"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          ref={(el) => { fileInputRefs.current[b.id] = el }}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && onAttachFile(b.id, e.target.files[0])}
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
                          <span className="flex items-center gap-1 text-[11px] text-signal-ok max-w-[140px] truncate" title={pendingFile.name}>
                            <CheckCircle2 size={12} className="shrink-0" /> {pendingFile.name}
                          </span>
                        )}
                        <button
                          onClick={() => clearBarge(b)}
                          disabled={s.ops === 0 && !pendingFile}
                          title="Reset this barge's analysed data back to 0"
                          className="ml-auto flex items-center gap-1 rounded-md border border-ink-600 px-2.5 py-1 text-xs text-paper-500 hover:border-signal-crit/40 hover:text-signal-crit focus-ring disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-ink-600 disabled:hover:text-paper-500"
                        >
                          <RotateCcw size={12} /> Reset
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => remove(b.id)} className="text-paper-500 hover:text-signal-crit focus-ring">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                  </Fragment>
                )
              })}
              {barges.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-paper-500 text-sm">
                    No barges tracked yet.
                  </td>
                </tr>
              )}
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
