import { Fragment, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileSpreadsheet, FileText, CheckCircle2, AlertTriangle, Plus } from "lucide-react"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import BargeSTSUploadModal from "@/components/BargeSTSUploadModal"
import { isValidIMO } from "@/lib/imo"
import { formatDateDisplay } from "@/lib/dates"
import { exportToXlsx } from "@/lib/exportXlsx"
import { exportToPdf } from "@/lib/exportPdf"
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

  // Match watchlist names against tracked barges, case/whitespace-insensitive.
  const bargeByName = new Map(barges.map((b) => [b.name.trim().toUpperCase(), b]))
  const findBarge = (name: string) => bargeByName.get(name.trim().toUpperCase())

  const bargeStats = (bargeId: string) => {
    const ops = operations.filter((o) => o.barge_id === bargeId && o.operation_type === "STS_BUNKERING")
    const latest = ops.length ? ops.reduce((m, o) => (o.operation_date > m ? o.operation_date : m), ops[0].operation_date) : null
    return { ops: ops.length, latest }
  }

  const onAttachFile = (bargeId: string, file: File) => {
    setPendingFiles((prev) => ({ ...prev, [bargeId]: file }))
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

  // Single-vessel PDF — that barge's analysed bunkering events only.
  const downloadVesselPdf = (b: Barge) => {
    const rows = operations
      .filter((o) => o.barge_id === b.id && o.operation_type === "STS_BUNKERING")
      .slice()
      .sort((a, c) => `${a.operation_date} ${a.start_time ?? ""}`.localeCompare(`${c.operation_date} ${c.start_time ?? ""}`))
    exportToPdf(
      `bunkerwatch_track_fko_${b.name.replace(/\s+/g, "_").toLowerCase()}.pdf`,
      `BUNKERWATCH — TRACK -FKO — ${b.name}`,
      ["#", "Company", "Vessel Served", "Date", "Time", "Location"],
      rows.map((o, i) => [i + 1, competitorName(b.competitor_id), o.receiving_vessel_name, formatDateDisplay(o.operation_date), o.start_time ?? "", o.location ?? ""])
    )
  }

  // Every distinct tracked (i.e. already-added) barge across all three
  // groups, deduplicated — a vessel deployed to more than one port is
  // still just one underlying barge with one shared set of uploaded data.
  const trackedBarges = Array.from(
    new Map(
      TRACK_FKO_GROUPS.flatMap((g) => g.entries)
        .map((e) => findBarge(e.name))
        .filter((b): b is Barge => !!b)
        .map((b) => [b.id, b])
    ).values()
  )

  const downloadAllExcel = () => {
    const rows = operations.filter((o) => o.operation_type === "STS_BUNKERING" && trackedBarges.some((b) => b.id === o.barge_id))
    exportToXlsx(
      "bunkerwatch_track_fko_all.xlsx",
      "Track -FKO",
      rows.map((o) => ({
        Company: o.competitor_name,
        Barge: o.barge_name,
        "Barge IMO": o.barge_imo,
        Vessel: o.receiving_vessel_name,
        Date: o.operation_date,
        Time: o.start_time ?? "",
        Location: o.location ?? "",
      }))
    )
  }

  const downloadAllPdf = () => {
    const rows = operations
      .filter((o) => o.operation_type === "STS_BUNKERING" && trackedBarges.some((b) => b.id === o.barge_id))
      .slice()
      .sort((a, b) => {
        if (a.barge_name !== b.barge_name) return a.barge_name < b.barge_name ? -1 : 1
        return `${a.operation_date} ${a.start_time ?? ""}`.localeCompare(`${b.operation_date} ${b.start_time ?? ""}`)
      })
    exportToPdf(
      "bunkerwatch_track_fko_all.pdf",
      "BUNKERWATCH — TRACK -FKO",
      ["#", "Company", "Vessel", "Barge IMO", "Vessel Served", "Date", "Time", "Location"],
      rows.map((o, i) => [i + 1, o.competitor_name, o.barge_name, o.barge_imo, o.receiving_vessel_name, formatDateDisplay(o.operation_date), o.start_time ?? "", o.location ?? ""])
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
                    <th className="px-4 py-2.5">Company</th>
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
                  {group.entries.map((entry) => {
                    const b = findBarge(entry.name)
                    if (!b) {
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
                              <option value="">Select company…</option>
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
                                <span className="flex items-center gap-1 text-[11px] text-signal-ok max-w-[120px] truncate" title={pendingFile.name}>
                                  <CheckCircle2 size={12} className="shrink-0" /> {pendingFile.name}
                                </span>
                              )}
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
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {competitors.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-signal-warn/40 bg-signal-warn/10 px-4 py-3 text-xs text-signal-warn">
            <AlertTriangle size={14} className="shrink-0" />
            Add at least one company under Competitors before you can add these vessels to the tracker.
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
