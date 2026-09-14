import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Download, AlertTriangle } from "lucide-react"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import KpiCard from "@/components/ui/KpiCard"
import { Radar, Ship, Sailboat, Building2 } from "lucide-react"
import DateRangeFilter from "@/components/filters/DateRangeFilter"
import MultiSelectFilter from "@/components/filters/MultiSelectFilter"
import OperationBadge from "@/components/ui/OperationBadge"
import { resolvePreset, formatDateDisplay } from "@/lib/dates"
import { exportToCsv } from "@/lib/exportCsv"
import { findOperationAnomalies } from "@/lib/anomalies"
import type { OperationType } from "@/types"
import { OPERATION_LABELS } from "@/lib/normalizeOperation"
import { vesselIdentityKey } from "@/lib/anomalies"

export default function STSAnalysis() {
  const provider = getDataProvider()
  const { data: competitors = [] } = useQuery({ queryKey: ["competitors"], queryFn: () => provider.getCompetitors() })
  const { data: barges = [] } = useQuery({ queryKey: ["barges"], queryFn: () => provider.getBarges() })

  const initialRange = resolvePreset("last30")
  const [dateFrom, setDateFrom] = useState(initialRange.from)
  const [dateTo, setDateTo] = useState(initialRange.to)
  const [competitorIds, setCompetitorIds] = useState<string[]>([])
  const [bargeIds, setBargeIds] = useState<string[]>([])
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [vesselQuery, setVesselQuery] = useState("")
  const [mode, setMode] = useState<"all" | "unique">("all")

  const filters = { dateFrom, dateTo, competitorIds, bargeIds, operationTypes, locations, receivingVesselQuery: vesselQuery }
  const [hasRun, setHasRun] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState(filters)

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["sts-analysis", appliedFilters],
    queryFn: () => provider.getSTSOperations(appliedFilters),
    enabled: hasRun,
  })

  const runAnalysis = () => {
    setAppliedFilters(filters)
    setHasRun(true)
  }

  const availableBarges = competitorIds.length ? barges.filter((b) => competitorIds.includes(b.competitor_id)) : barges
  const locationOptions = useMemo(() => {
    const set = new Set<string>()
    barges.forEach(() => {})
    return ["Fujairah", "Khor Fakkan", "Port Rashid", "Jebel Ali", "Sharjah Anchorage"]
  }, [barges])

  const uniqueVesselRows = useMemo(() => {
    const map = new Map<
      string,
      { name: string; imo: string; count: number; first: string; last: string; competitors: Set<string> }
    >()
    results.forEach((op) => {
      const key = vesselIdentityKey(op)
      const existing = map.get(key)
      if (existing) {
        existing.count++
        existing.competitors.add(op.competitor_name)
        if (op.operation_date < existing.first) existing.first = op.operation_date
        if (op.operation_date > existing.last) existing.last = op.operation_date
      } else {
        map.set(key, {
          name: op.receiving_vessel_name,
          imo: op.receiving_vessel_imo,
          count: 1,
          first: op.operation_date,
          last: op.operation_date,
          competitors: new Set([op.competitor_name]),
        })
      }
    })
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [results])

  const uniqueVesselCount = new Set(results.map(vesselIdentityKey)).size
  const activeBargeCount = new Set(results.map((o) => o.barge_id)).size
  const activeCompetitorCount = new Set(results.map((o) => o.competitor_id)).size

  const flaggedIndices = useMemo(() => findOperationAnomalies(results), [results])

  const runExport = () => {
    if (mode === "all") {
      exportToCsv(
        `bunkerwatch_sts_${dateFrom}_${dateTo}.csv`,
        results.map((o) => ({
          Date: o.operation_date,
          Time: o.start_time,
          Competitor: o.competitor_name,
          Barge: o.barge_name,
          "Barge IMO": o.barge_imo,
          Location: o.location,
          Operation: OPERATION_LABELS[o.operation_type],
          "Receiving Vessel": o.receiving_vessel_name,
          "Receiving IMO": o.receiving_vessel_imo,
          "Duration (min)": o.duration_minutes,
        }))
      )
    } else {
      exportToCsv(
        `bunkerwatch_unique_vessels_${dateFrom}_${dateTo}.csv`,
        uniqueVesselRows.map((v) => ({
          Vessel: v.name,
          IMO: v.imo,
          Operations: v.count,
          First: v.first,
          Last: v.last,
          Competitors: [...v.competitors].join("; "),
        }))
      )
    }
  }

  return (
    <div>
      <PageHeader title="Competitor Analysis" subtitle="Which vessels did competitor barges supply, and when?" />

      <div className="px-6">
        <div className="rounded-xl glass p-4 flex flex-wrap items-center gap-3">
          <DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t) }} />
          <MultiSelectFilter
            label="Competitor"
            options={competitors.map((c) => ({ value: c.id, label: c.name }))}
            selected={competitorIds}
            onChange={(v) => { setCompetitorIds(v); setBargeIds([]) }}
          />
          <MultiSelectFilter
            label="Barge"
            options={availableBarges.map((b) => ({ value: b.id, label: b.name }))}
            selected={bargeIds}
            onChange={setBargeIds}
          />
          <MultiSelectFilter
            label="Operation"
            options={(Object.keys(OPERATION_LABELS) as OperationType[]).map((t) => ({ value: t, label: OPERATION_LABELS[t] }))}
            selected={operationTypes}
            onChange={(v) => setOperationTypes(v as OperationType[])}
          />
          <MultiSelectFilter
            label="Location"
            options={locationOptions.map((l) => ({ value: l, label: l }))}
            selected={locations}
            onChange={setLocations}
          />
          <input
            value={vesselQuery}
            onChange={(e) => setVesselQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
            placeholder="Receiving vessel / IMO…"
            className="bg-ink-800 border border-ink-600 rounded-md px-2.5 py-1.5 text-xs w-48 focus-ring"
          />
          <button
            onClick={runAnalysis}
            className="ml-auto rounded-md bg-vivid-blue text-white shadow-sm hover:brightness-110 transition-all px-5 py-2 text-sm font-medium focus-ring"
          >
            Run analysis
          </button>
        </div>

        <p className="mt-2 text-[11px] text-paper-500">
          Leave Competitor and Barge unselected to include every tracked barge. Pick a date range above, then press
          Run Analysis.
        </p>

        {!hasRun && (
          <div className="mt-4 rounded-xl glass px-4 py-10 text-center">
            <p className="text-sm text-paper-300">Set a date range above and press Run Analysis.</p>
            <p className="mt-1 text-xs text-paper-500">
              With no Competitor or Barge selected, every tracked barge is included.
            </p>
          </div>
        )}

        {hasRun && (
        <>
        <div className="mt-4 grid grid-cols-4 gap-3">
          <KpiCard label="STS Operations" value={results.length} icon={Radar} tone="blue" />
          <KpiCard label="Unique Receiving Vessels" value={uniqueVesselCount} icon={Ship} tone="green" />
          <KpiCard label="Active Barges" value={activeBargeCount} icon={Sailboat} tone="teal" />
          <KpiCard label="Active Competitors" value={activeCompetitorCount} icon={Building2} tone="orange" />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex rounded-md border border-ink-600 overflow-hidden">
            <button
              onClick={() => setMode("all")}
              className={`px-3 py-1.5 text-xs ${mode === "all" ? "bg-ink-700 text-paper-100" : "text-paper-500 hover:bg-ink-800"}`}
            >
              All Operations
            </button>
            <button
              onClick={() => setMode("unique")}
              className={`px-3 py-1.5 text-xs ${mode === "unique" ? "bg-ink-700 text-paper-100" : "text-paper-500 hover:bg-ink-800"}`}
            >
              Unique Vessels
            </button>
          </div>
          <button
            onClick={runExport}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-xs text-paper-300 hover:bg-ink-800 focus-ring"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>

        <div className="mt-3 mb-10 rounded-xl glass overflow-hidden">
          {mode === "all" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs font-medium text-paper-500">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-4 py-2.5">Competitor</th>
                  <th className="px-4 py-2.5">Barge</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5">Operation</th>
                  <th className="px-4 py-2.5">Receiving Vessel</th>
                  <th className="px-4 py-2.5">Receiving IMO</th>
                  <th className="px-4 py-2.5 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {results
                  .map((o, i) => ({ o, i }))
                  .sort((a, b) => (a.o.operation_date < b.o.operation_date ? 1 : -1))
                  .map(({ o, i }) => (
                    <tr key={o.id} className="border-b border-ink-800 hover:bg-ink-800/60">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {formatDateDisplay(o.operation_date)}
                          {flaggedIndices.has(i) && (
                            <span title="Flagged: same barge/different vessel or same vessel/different barge less than 5 hours apart — worth double-checking. See Barges page for details.">
                              <AlertTriangle size={12} className="text-signal-warn" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-paper-500">{o.start_time ?? "—"}</td>
                      <td className="px-4 py-2.5">{o.competitor_name}</td>
                      <td className="px-4 py-2.5">{o.barge_name}</td>
                      <td className="px-4 py-2.5 text-paper-300">{o.location ?? "N/A"}</td>
                      <td className="px-4 py-2.5"><OperationBadge type={o.operation_type} /></td>
                      <td className="px-4 py-2.5 font-medium">
                        <Link
                          to={o.receiving_vessel_imo ? `/vessels?imo=${encodeURIComponent(o.receiving_vessel_imo)}` : `/vessels?name=${encodeURIComponent(o.receiving_vessel_name)}`}
                          className="hover:text-brand-600 hover:underline"
                        >
                          {o.receiving_vessel_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-paper-500">{o.receiving_vessel_imo || "N/A"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-paper-500">
                        {o.duration_minutes ? `${o.duration_minutes}m` : "—"}
                      </td>
                    </tr>
                  ))}
                {!isFetching && results.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-paper-500 text-sm">
                      No observed STS operations match your selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs font-medium text-paper-500">
                  <th className="px-4 py-2.5">Vessel</th>
                  <th className="px-4 py-2.5">IMO</th>
                  <th className="px-4 py-2.5 text-right">Operations</th>
                  <th className="px-4 py-2.5">First</th>
                  <th className="px-4 py-2.5">Last</th>
                  <th className="px-4 py-2.5">Competitors</th>
                </tr>
              </thead>
              <tbody>
                {uniqueVesselRows.map((v) => (
                  <tr key={v.imo || v.name} className="border-b border-ink-800 hover:bg-ink-800/60">
                    <td className="px-4 py-2.5 font-medium">
                      <Link
                        to={v.imo ? `/vessels?imo=${encodeURIComponent(v.imo)}` : `/vessels?name=${encodeURIComponent(v.name)}`}
                        className="hover:text-brand-600 hover:underline"
                      >
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-paper-500">{v.imo || "N/A"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{v.count}</td>
                    <td className="px-4 py-2.5 text-xs">{formatDateDisplay(v.first)}</td>
                    <td className="px-4 py-2.5 text-xs">{formatDateDisplay(v.last)}</td>
                    <td className="px-4 py-2.5 text-xs text-paper-300">{[...v.competitors].join(", ")}</td>
                  </tr>
                ))}
                {uniqueVesselRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-paper-500 text-sm">
                      No observed STS operations match your selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  )
}
