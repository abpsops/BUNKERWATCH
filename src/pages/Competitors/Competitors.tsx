import { Fragment, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams, useNavigate } from "react-router-dom"
import { Plus, X, ChevronDown, ChevronRight, Sailboat } from "lucide-react"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import { formatDateDisplay } from "@/lib/dates"
import { colorForCompetitor } from "@/lib/competitorColors"
import { vesselIdentityKey } from "@/lib/anomalies"

export default function Competitors() {
  const provider = getDataProvider()
  const qc = useQueryClient()
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(routeId ?? null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { data: competitors = [] } = useQuery({ queryKey: ["competitors"], queryFn: () => provider.getCompetitors() })
  const { data: barges = [] } = useQuery({ queryKey: ["barges"], queryFn: () => provider.getBarges() })
  const { data: operations = [] } = useQuery({ queryKey: ["operations-all"], queryFn: () => provider.getSTSOperations({}) })

  const stats = (competitorId: string) => {
    const ops = operations.filter((o) => o.competitor_id === competitorId)
    const uniqueVessels = new Set(ops.map(vesselIdentityKey)).size
    const activeBarges = barges.filter((b) => b.competitor_id === competitorId && b.active).length
    const latest = ops.length ? ops.reduce((m, o) => (o.operation_date > m ? o.operation_date : m), ops[0].operation_date) : null
    return { operations: ops.length, uniqueVessels, activeBarges, latest }
  }

  const submit = async () => {
    if (!name.trim() || !code.trim()) return
    await provider.upsertCompetitor({ name: name.trim(), code: code.trim().toUpperCase(), description: description || null })
    setName("")
    setCode("")
    setDescription("")
    setShowForm(false)
    qc.invalidateQueries({ queryKey: ["competitors"] })
  }

  const remove = async (id: string) => {
    await provider.deleteCompetitor(id)
    qc.invalidateQueries({ queryKey: ["competitors"] })
    qc.invalidateQueries({ queryKey: ["barges"] })
    if (selectedId === id) setSelectedId(null)
  }

  const selected = competitors.find((c) => c.id === selectedId)

  return (
    <div>
      <PageHeader
        title="Competitors"
        subtitle="Tracked competitor bunker suppliers."
        actions={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 rounded-md bg-vivid-purple px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:brightness-110 transition-all focus-ring"
          >
            <Plus size={13} /> Add Competitor
          </button>
        }
      />

      <div className="px-6">
        {showForm && (
          <div className="mb-4 rounded-xl glass p-4 flex flex-wrap items-end gap-3">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Al Marwan Bunkering" />
            </Field>
            <Field label="Short Code">
              <input value={code} onChange={(e) => setCode(e.target.value)} className="input w-24" placeholder="ABC" />
            </Field>
            <Field label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="input w-64" placeholder="Optional" />
            </Field>
            <button onClick={submit} className="rounded-md bg-vivid-purple text-white shadow-sm hover:brightness-110 transition-all px-3 py-1.5 text-xs font-medium">
              Save
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl glass overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs font-medium text-paper-500">
                  <th className="px-2 py-2.5 w-6"></th>
                  <th className="px-4 py-2.5">Competitor</th>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5 text-right">Barges</th>
                  <th className="px-4 py-2.5 text-right">Operations</th>
                  <th className="px-4 py-2.5 text-right">Unique Vessels</th>
                  <th className="px-4 py-2.5">Latest</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => {
                  const s = stats(c.id)
                  const isExpanded = expandedIds.has(c.id)
                  const compBarges = barges.filter((b) => b.competitor_id === c.id)
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => {
                          setSelectedId(c.id)
                          navigate(`/competitors/${c.id}`, { replace: true })
                        }}
                        className={`border-b border-ink-800 cursor-pointer hover:bg-ink-800/60 ${
                          selectedId === c.id ? "bg-ink-800" : ""
                        }`}
                      >
                        <td className="px-2 py-2.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpanded(c.id)
                            }}
                            className="text-paper-500 hover:text-paper-300 focus-ring"
                            title={isExpanded ? "Hide barges" : "Show barges"}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                              style={{ backgroundColor: colorForCompetitor(c.id) }}
                            >
                              {c.code.slice(0, 2)}
                            </span>
                            {c.name}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-paper-500">{c.code}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{s.activeBarges}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{s.operations}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{s.uniqueVessels}</td>
                        <td className="px-4 py-2.5 text-paper-500 text-xs">
                          {s.latest ? formatDateDisplay(s.latest) : "N/A"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              remove(c.id)
                            }}
                            className="text-paper-500 hover:text-signal-crit focus-ring"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-ink-800 bg-ink-900/40">
                          <td></td>
                          <td colSpan={7} className="px-4 py-3">
                            {compBarges.length === 0 ? (
                              <div className="text-xs text-paper-500">No barges added for {c.name} yet.</div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {compBarges.map((b) => (
                                  <div
                                    key={b.id}
                                    className="flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-950 px-2.5 py-1 text-xs"
                                  >
                                    <Sailboat size={11} style={{ color: colorForCompetitor(c.id) }} />
                                    <span className="font-medium">{b.name}</span>
                                    <span className="font-mono text-paper-500">{b.imo}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {competitors.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-paper-500 text-sm">
                      No competitors tracked yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl glass p-4">
            {!selected && <div className="text-sm text-paper-500">Select a competitor to view its profile.</div>}
            {selected && (
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: colorForCompetitor(selected.id) }}
                  >
                    {selected.code.slice(0, 2)}
                  </span>
                  <div className="font-display text-lg">{selected.name}</div>
                </div>
                <div className="text-xs font-mono text-paper-500 mb-4 ml-[42px]">{selected.code}</div>
                {(() => {
                  const s = stats(selected.id)
                  return (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <Stat label="Tracked Barges" value={s.activeBarges} />
                      <Stat label="STS Operations" value={s.operations} />
                      <Stat label="Unique Vessels" value={s.uniqueVessels} />
                      <Stat label="Latest Activity" value={s.latest ? formatDateDisplay(s.latest) : "N/A"} />
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`.input { background:#F7F9FC; border:1px solid #E2E8F0; border-radius:4px; padding:6px 8px; font-size:13px; color:#0B1220; }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-paper-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-ink-700 px-2.5 py-2">
      <div className="text-[10px] text-paper-500 font-mono uppercase">{label}</div>
      <div className="font-mono text-paper-100">{value}</div>
    </div>
  )
}
