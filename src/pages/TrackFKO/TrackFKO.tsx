import { Fragment, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileSpreadsheet, FileText, CheckCircle2, AlertTriangle, Plus, RotateCcw, X } from "lucide-react"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import BargeSTSUploadModal from "@/components/BargeSTSUploadModal"
import { isValidIMO } from "@/lib/imo"
import { formatDateDisplay } from "@/lib/dates"
import { exportToXlsx } from "@/lib/exportXlsx"
import { exportToPdf, buildPdfSummary, buildDateRangeLabel, buildPdfCompetitorLocationBreakdown } from "@/lib/exportPdf"
import { findOperationAnomalies, findOperationAnomalyDetails, vesselIdentityKey } from "@/lib/anomalies"
import { buildOwnBargeIndex, isOwnBargeSupply } from "@/lib/ownBarge"
import { TRACK_FKO_GROUPS, type TrackFkoPort } from "@/lib/trackFko"
import type { Barge } from "@/types"

const PORT_LABELS: Record<TrackFkoPort, string> = {
  FUJ: "FUJ — Fujairah",
  KFK: "KFK — Khor Fakkan",
  OMAN: "OMAN — Sohar / Salalah / Shinas / Al Duqm",
}

const PORT_COLORS: Record<TrackFkoPort, string> = {
  FUJ: "#2563EB",
  KFK: "#0D9488",
  OMAN: "#EA580C",
}

export default function TrackFKO() {
  const provider = getDataProvider()
  const qc = useQueryClient()

  // Per-not-yet-added vessel name: the company + IMO staged before it's
  // created as a real tracked barge.
  const [addCompetitorId, setAddCompetitorId] = useState<Record<string, string>>({})
  const [addImo, setAddImo] = useState<Record<string, string>>({})

  // Per-barge: the file attached via "Upload" but not yet analysed.
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({})
  // Which barge's Analyse modal is currently open.
  const [analysingBarge, setAnalysingBarge] = useState<Barge | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const { data: competitors = [] } = useQuery({ queryKey: ["competitors"], queryFn: () => provider.getCompetitors() })
  const { data: barges = [] } = useQuery({ queryKey: ["barges"], queryFn: () => provider.getBarges() })
  const { data: operations = [] } = useQuery({ queryKey: ["operations-all"], queryFn: () => provider.getSTSOperations({}) })

  const competitorName = (id: string) => competitors.find((c) => c.id === id)?.name ?? "—"

  // Match watchlist names against tracked barges. Case/whitespace
  // differences are normalized, and — because real fleet data has at
  // least one vessel logged with a typo'd Roman numeral ("Vista Lll"
  // instead of "Vista III") — a trailing run of 2+ I/L characters is
  // also normalized to all "I"s before comparing, so that kind of typo
  // still matches. Returns every barge that matches, not just one: two
  // different companies can genuinely have a barge of the same name (the
  // real fleet data has two "Casper" barges, one under Pearl Marine/PC
  // and one under 1Energin), and both should show up as their own row.
  const normalizeForMatch = (name: string) =>
    name.trim().toUpperCase().replace(/\s+/g, " ").replace(/([IL]{2,})$/, (m) => "I".repeat(m.length))

  const bargesByName = new Map<string, Barge[]>()
  barges.forEach((b) => {
    const key = normalizeForMatch(b.name)
    const list = bargesByName.get(key) ?? []
    list.push(b)
    bargesByName.set(key, list)
  })
  const findBarges = (name: string): Barge[] => bargesByName.get(normalizeForMatch(name)) ?? []

  const bargeStats = (bargeId: string) => {
    const ops = operations.filter((o) => o.barge_id === bargeId && o.operation_type === "STS_BUNKERING")
    const latest = ops.length ? ops.reduce((m, o) => (o.operation_date > m ? o.operation_date : m), ops[0].operation_date) : null
    return { ops: ops.length, latest }
  }

  // Same "OWN BARGE" flagging used on the Barges page — one of this
  // competitor's OTHER barges showing up as the "receiving vessel" isn't
  // a genuine third-party client, so it's noted rather than counted as a
  // normal competitive supply.
  const ownBargeIndex = buildOwnBargeIndex(barges)
  const isOwnBarge = (o: { competitor_id: string; receiving_vessel_name: string }) => isOwnBargeSupply(o, ownBargeIndex)

  const onAttachFile = (bargeId: string, file: File) => {
    setPendingFiles((prev) => ({ ...prev, [bargeId]: file }))
  }

  // Cancels a file that was attached via "Upload" but not analysed yet —
  // just removes the staged file, without touching any already-analysed
  // data for that barge.
  const removePendingFile = (bargeId: string) => {
    setPendingFiles((prev) => {
      const next = { ...prev }
      delete next[bargeId]
      return next
    })
  }

  const addVessel = async (name: string) => {
    const competitorId = addCompetitorId[name]
    const imo = (addImo[name] ?? "").trim()
    if (!competitorId || !isValidIMO(imo)) return
    await provider.upsertBarge({ name, imo, competitor_id: competitorId })
    setAddCompetitorId((prev) => { const next = { ...prev }; delete next[name]; return next })
    setAddImo((prev) => { const next = { ...prev }; delete next[name]; return next })
    qc.invalidateQueries({ queryKey: ["barges"] })
  }

  // Single-vessel PDF — that barge's analysed bunkering events only, with
  // the same anomaly flagging, gap reasons, and OWN BARGE notes as the
  // main Barges report. Scoped to just this barge, so only the "same
  // barge, different vessel, too fast" pattern can be caught here — the
  // "same vessel, different barge" pattern needs the other barge's data
  // too, which is what "Download All (PDF)" below checks across every
  // tracked vessel at once.
  const downloadVesselPdf = (b: Barge) => {
    const rows = operations
      .filter((o) => o.barge_id === b.id && o.operation_type === "STS_BUNKERING")
      .slice()
      .sort((a, c) => `${a.operation_date} ${a.start_time ?? ""}`.localeCompare(`${c.operation_date} ${c.start_time ?? ""}`))
    const dateRangeLabel = buildDateRangeLabel(rows.map((o) => o.operation_date), formatDateDisplay)
    const flaggedRows = Array.from(findOperationAnomalies(rows))
    const anomalyExplanations = findOperationAnomalyDetails(rows).map((d) => ({
      rowNumbers: [d.indices[0] + 1, d.indices[1] + 1] as [number, number],
      gapLabel: d.gapLabel,
      summary: d.summary,
    }))

    exportToPdf(
      `bunkerwatch_track_fko_${b.name.replace(/\s+/g, "_").toLowerCase()}.pdf`,
      `BUNKERWATCH — TRACK -FKO — ${b.name}`,
      ["#", "Competitor", "Barge", "Barge IMO", "Vessel", "Date", "Time", "Location", "Note"],
      rows.map((o, i) => [
        i + 1,
        competitorName(b.competitor_id),
        b.name,
        b.imo,
        o.receiving_vessel_name,
        formatDateDisplay(o.operation_date),
        o.start_time ?? "",
        o.location ?? "",
        isOwnBarge(o) ? "OWN BARGE" : "",
      ]),
      {
        dateRangeLabel,
        flaggedRows,
        anomalyExplanations,
        firstColumnIsRowNumber: true,
        noteColumnIndex: 8,
      }
    )
  }

  // Every distinct tracked (i.e. already-added) barge across all three
  // groups, deduplicated by barge id — a vessel deployed to more than one
  // port is still just one underlying barge with one shared set of
  // uploaded data, but two genuinely different barges sharing a name (see
  // above) both stay in this list as separate entries.
  const trackedBarges = Array.from(
    new Map(
      TRACK_FKO_GROUPS.flatMap((g) => g.entries.flatMap((e) => findBarges(e.name))).map((b) => [b.id, b] as const)
    ).values()
  )

  // Grouped by COMPANY first, then by barge within that company — same
  // ordering the Barges report uses — so cross-barge anomaly detection
  // (a vessel bunkered by two different tracked barges too close
  // together) and the group-break lines line up correctly.
  const trackedBargeIds = new Set(trackedBarges.map((b) => b.id))
  const allTrackedRows = () =>
    operations
      .filter((o) => o.operation_type === "STS_BUNKERING" && trackedBargeIds.has(o.barge_id))
      .slice()
      .sort((a, b) => {
        if (a.competitor_name !== b.competitor_name) return a.competitor_name < b.competitor_name ? -1 : 1
        if (a.barge_name !== b.barge_name) return a.barge_name < b.barge_name ? -1 : 1
        if (a.barge_id !== b.barge_id) return a.barge_id < b.barge_id ? -1 : 1
        const aKey = `${a.operation_date} ${a.start_time ?? ""}`
        const bKey = `${b.operation_date} ${b.start_time ?? ""}`
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
      })

  // Resets a single tracked barge's analyser back to zero: deletes every
  // imported STS operation tied to it and clears any file staged but not
  // yet analysed. The barge record itself (name, IMO, company) is
  // untouched — same behaviour as "Reset" on the Barges page.
  const clearBarge = async (b: Barge) => {
    const s = bargeStats(b.id)
    const hasPending = !!pendingFiles[b.id]
    if (s.ops === 0 && !hasPending) return
    const confirmed = window.confirm(
      `Clear all analysed data for "${b.name}"? This deletes ${s.ops} bunkering event${s.ops === 1 ? "" : "s"} imported for this barge and cannot be undone.`
    )
    if (!confirmed) return
    await provider.deleteOperationsByBarge(b.id)
    removePendingFile(b.id)
    qc.invalidateQueries({ queryKey: ["operations-all"] })
    qc.invalidateQueries({ queryKey: ["sts-analysis"] })
  }

  // Resets EVERY tracked barge's analyser back to zero in one action —
  // deletes all imported STS operations across every barge on this
  // watchlist and clears any files staged but not yet analysed. Barges
  // not on the Track -FKO list are untouched.
  const clearAllTracked = async () => {
    const totalOps = operations.filter((o) => o.operation_type === "STS_BUNKERING" && trackedBargeIds.has(o.barge_id)).length
    const pendingCount = trackedBarges.filter((b) => pendingFiles[b.id]).length
    if (totalOps === 0 && pendingCount === 0) return
    const confirmed = window.confirm(
      `Clear ALL analysed data for every tracked vessel? This deletes ${totalOps} bunkering event${totalOps === 1 ? "" : "s"} across all ${trackedBarges.length} tracked vessel${trackedBarges.length === 1 ? "" : "s"} and cannot be undone.`
    )
    if (!confirmed) return
    await Promise.all(trackedBarges.map((b) => provider.deleteOperationsByBarge(b.id)))
    setPendingFiles((prev) => {
      const next = { ...prev }
      trackedBarges.forEach((b) => delete next[b.id])
      return next
    })
    qc.invalidateQueries({ queryKey: ["operations-all"] })
    qc.invalidateQueries({ queryKey: ["sts-analysis"] })
  }

  const downloadAllExcel = () => {
    exportToXlsx(
      "bunkerwatch_track_fko_all.xlsx",
      "Track -FKO",
      allTrackedRows().map((o) => ({
        Competitor: o.competitor_name,
        Barge: o.barge_name,
        "Barge IMO": o.barge_imo,
        Vessel: o.receiving_vessel_name,
        Date: o.operation_date,
        Time: o.start_time ?? "",
        Location: o.location ?? "",
        Note: isOwnBarge(o) ? "OWN BARGE" : "",
      }))
    )
  }

  const downloadAllPdf = () => {
    const rows = allTrackedRows()
    const byCompetitor = buildPdfSummary(rows, (o) => o.competitor_name, vesselIdentityKey)
    const byLocation = buildPdfSummary(rows, (o) => o.location || "Unknown", vesselIdentityKey)
    const byCompetitorLocation = buildPdfCompetitorLocationBreakdown(
      rows,
      (o) => o.competitor_name,
      (o) => o.location || "Unknown",
      vesselIdentityKey
    )
    const dateRangeLabel = buildDateRangeLabel(rows.map((o) => o.operation_date), formatDateDisplay)
    // A separator line under the last row of each barge's block — same
    // as the Barges report — so one barge's operations are visually set
    // off from the next.
    const groupBreakAfterRows = rows
      .map((o, i) => (i < rows.length - 1 && o.barge_id !== rows[i + 1].barge_id ? i : -1))
      .filter((i) => i >= 0)
    // Flags operations less than 5 hours apart on either a shared tracked
    // barge (different vessel) or a shared vessel (different tracked
    // barge) — checked across every barge in this Track -FKO watchlist at
    // once, so this catches "same vessel, different barge" pairs that the
    // single-vessel report above can't see on its own.
    const flaggedRows = Array.from(findOperationAnomalies(rows))
    const anomalyExplanations = findOperationAnomalyDetails(rows).map((d) => ({
      rowNumbers: [d.indices[0] + 1, d.indices[1] + 1] as [number, number],
      gapLabel: d.gapLabel,
      summary: d.summary,
    }))

    exportToPdf(
      "bunkerwatch_track_fko_all.pdf",
      "BUNKERWATCH — TRACK -FKO — TRACKED BUNKERING OPS",
      ["#", "Competitor", "Barge", "Barge IMO", "Vessel", "Date", "Time", "Location", "Note"],
      rows.map((o, i) => [
        i + 1,
        o.competitor_name,
        o.barge_name,
        o.barge_imo,
        o.receiving_vessel_name,
        formatDateDisplay(o.operation_date),
        o.start_time ?? "",
        o.location ?? "",
        isOwnBarge(o) ? "OWN BARGE" : "",
      ]),
      {
        dateRangeLabel,
        groupBreakAfterRows,
        flaggedRows,
        firstColumnIsRowNumber: true,
        noteColumnIndex: 8,
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

  return (
    <div>
      <PageHeader
        title="Track -FKO"
        subtitle="Fixed FUJ / KFK / OMAN watchlist — upload each vessel's export, Analyse to extract Bunkering events, then Report to PDF."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={downloadAllExcel}
              disabled={trackedBarges.length === 0}
              className="flex items-center gap-1.5 rounded-md bg-vivid-green px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:brightness-110 transition-all focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
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
            <button
              onClick={clearAllTracked}
              title="Reset every tracked vessel's analysed data back to 0"
              className="flex items-center gap-1.5 rounded-md border border-vivid-red/40 text-vivid-red px-3 py-1.5 text-xs hover:bg-vivid-red-tint transition-colors focus-ring"
            >
              <RotateCcw size={13} /> Clear All
            </button>
          </div>
        }
      />

      <div className="px-6 space-y-6">
        {TRACK_FKO_GROUPS.map((group) => (
          <div key={group.port}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ background: PORT_COLORS[group.port] }}
              >
                {PORT_LABELS[group.port]}
              </span>
              <span className="text-xs text-paper-500">Total: {group.entries.length}</span>
            </div>

            <div className="rounded-xl glass overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-xs font-medium text-paper-500">
                    <th className="px-4 py-2.5">Competitor</th>
                    <th className="px-4 py-2.5">Vessel</th>
                    <th className="px-4 py-2.5">IMO</th>
                    {group.port === "OMAN" && <th className="px-4 py-2.5">Destination</th>}
                    <th className="px-4 py-2.5 text-right">Bunkering Events</th>
                    <th className="px-4 py-2.5">Last Activity</th>
                    <th className="px-4 py-2.5">STS Data</th>
                    <th className="px-4 py-2.5">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {group.entries.flatMap((entry) => {
                    const matches = findBarges(entry.name)
                    if (matches.length === 0) {
                      // Not yet tracked — inline form to pick the company and
                      // enter the IMO (the source report has neither), which
                      // creates it as a real tracked barge on submit.
                      const imoVal = addImo[entry.name] ?? ""
                      const imoTouched = imoVal.length > 0
                      const canAdd = !!addCompetitorId[entry.name] && isValidIMO(imoVal)
                      return (
                        <tr key={entry.name} className="border-b border-ink-800">
                          <td className="px-4 py-2.5">
                            <select
                              value={addCompetitorId[entry.name] ?? ""}
                              onChange={(e) => setAddCompetitorId((prev) => ({ ...prev, [entry.name]: e.target.value }))}
                              className="bg-ink-800 border border-ink-600 rounded-md px-2 py-1 text-xs min-w-[140px]"
                            >
                              <option value="">Select competitor…</option>
                              {competitors.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2.5 text-paper-300">{entry.name}</td>
                          <td className="px-4 py-2.5">
                            <input
                              value={imoVal}
                              onChange={(e) => setAddImo((prev) => ({ ...prev, [entry.name]: e.target.value }))}
                              placeholder="IMO"
                              className={`bg-ink-800 border rounded-md px-2 py-1 text-xs font-mono w-24 ${
                                imoTouched && !isValidIMO(imoVal) ? "border-signal-crit/60" : "border-ink-600"
                              }`}
                            />
                          </td>
                          {group.port === "OMAN" && <td className="px-4 py-2.5 text-xs text-paper-500">{entry.destination}</td>}
                          <td className="px-4 py-2.5 text-right text-paper-500 text-xs" colSpan={1}>Not tracked yet</td>
                          <td className="px-4 py-2.5" />
                          <td className="px-4 py-2.5" colSpan={2}>
                            <button
                              onClick={() => addVessel(entry.name)}
                              disabled={!canAdd}
                              className="flex items-center gap-1.5 rounded-md bg-vivid-purple text-white shadow-sm hover:brightness-110 transition-all px-2.5 py-1 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Plus size={12} /> Add to Tracker
                            </button>
                          </td>
                        </tr>
                      )
                    }

                    return matches.map((b) => {
                      const s = bargeStats(b.id)
                      const pendingFile = pendingFiles[b.id]
                      return (
                        <Fragment key={b.id}>
                          <tr className="border-b border-ink-800 hover:bg-ink-800/60 transition-colors">
                            <td className="px-4 py-2.5 text-paper-300">{competitorName(b.competitor_id)}</td>
                            <td className="px-4 py-2.5">{b.name}</td>
                            <td className="px-4 py-2.5 font-mono text-paper-500">{b.imo}</td>
                            {group.port === "OMAN" && <td className="px-4 py-2.5 text-xs text-paper-500">{entry.destination}</td>}
                            <td className="px-4 py-2.5 text-right font-mono">{s.ops}</td>
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
                                  <span className="flex items-center gap-1 text-[11px] text-signal-ok max-w-[110px] truncate" title={pendingFile.name}>
                                    <CheckCircle2 size={12} className="shrink-0" /> {pendingFile.name}
                                    <button
                                      onClick={() => removePendingFile(b.id)}
                                      title="Remove this file"
                                      className="text-paper-500 hover:text-signal-crit focus-ring shrink-0"
                                    >
                                      <X size={11} />
                                    </button>
                                  </span>
                                )}
                                <button
                                  onClick={() => clearBarge(b)}
                                  disabled={s.ops === 0 && !pendingFile}
                                  title="Reset this vessel's analysed data back to 0"
                                  className="ml-auto flex items-center gap-1 rounded-md border border-ink-600 px-2 py-1 text-xs text-paper-500 hover:border-signal-crit/40 hover:text-signal-crit focus-ring disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-ink-600 disabled:hover:text-paper-500"
                                >
                                  <RotateCcw size={11} />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => downloadVesselPdf(b)}
                                disabled={s.ops === 0}
                                title={s.ops === 0 ? "Analyse a file first" : `Report ${b.name} to PDF`}
                                className="flex items-center gap-1.5 rounded-md bg-vivid-blue text-white shadow-sm hover:brightness-110 transition-all px-2.5 py-1 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <FileText size={12} /> Report (PDF)
                              </button>
                            </td>
                          </tr>
                        </Fragment>
                      )
                    })
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {competitors.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-signal-warn/40 bg-signal-warn/10 px-4 py-3 text-xs text-signal-warn">
            <AlertTriangle size={14} className="shrink-0" />
            Add at least one competitor under Competitors before you can add these vessels to the tracker.
          </div>
        )}
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
