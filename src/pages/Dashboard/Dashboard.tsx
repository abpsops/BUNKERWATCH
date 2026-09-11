import { useQuery } from "@tanstack/react-query"
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import KpiCard from "@/components/ui/KpiCard"
import { Building2, Sailboat, Radar, Ship, Clock, CalendarDays, CalendarRange, AlertTriangle } from "lucide-react"
import { formatDateDisplay, resolvePreset } from "@/lib/dates"
import { colorForCompetitor } from "@/lib/competitorColors"
import { findOperationAnomalies, vesselIdentityKey } from "@/lib/anomalies"
import { Link } from "react-router-dom"

// A repeating, curated hue cycle for charts that aren't keyed to a
// specific competitor (e.g. bars-by-day below) — colorForCompetitor is
// used instead wherever a bar/series actually represents one competitor,
// so that competitor's color stays stable across the whole app.
const CHART_HUES = ["#2563EB", "#0D9488", "#EA580C", "#7C3AED", "#DB2777", "#0891B2", "#16A34A", "#D97706"]

function isoWeekLabel(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr + "T00:00:00Z")
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - 3)
  return { key: `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, label: `${monday.getUTCDate()}/${monday.getUTCMonth() + 1}` }
}

export default function Dashboard() {
  const provider = getDataProvider()
  const { data: competitors = [] } = useQuery({ queryKey: ["competitors"], queryFn: () => provider.getCompetitors() })
  const { data: barges = [] } = useQuery({ queryKey: ["barges"], queryFn: () => provider.getBarges() })
  const { data: operations = [] } = useQuery({
    queryKey: ["operations-all"],
    queryFn: () => provider.getSTSOperations({}),
  })

  const last24h = resolvePreset("today")
  const last7 = resolvePreset("last7")
  const thisMonth = resolvePreset("thisMonth")

  const countInRange = (from: string, to: string) =>
    operations.filter((o) => o.operation_date >= from && o.operation_date <= to).length

  const uniqueVessels = new Set(operations.map(vesselIdentityKey)).size
  const anomalyCount = findOperationAnomalies(operations).size
  const latestActivity = operations.length
    ? operations.reduce((max, o) => (o.operation_date > max ? o.operation_date : max), operations[0].operation_date)
    : null

  const byDay = new Map<string, number>()
  operations.forEach((o) => byDay.set(o.operation_date, (byDay.get(o.operation_date) ?? 0) + 1))
  const dailySeries = [...byDay.entries()]
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .slice(-30)
    .map(([date, count]) => ({ date: date.slice(5), count }))

  const byCompetitor = competitors
    .map((c) => ({
      id: c.id,
      name: c.code,
      count: operations.filter((o) => o.competitor_id === c.id).length,
    }))
    .sort((a, b) => b.count - a.count)

  // Weekly STS Bunkering trend for the top 6 most active competitors —
  // enough series to compare, few enough to stay legible.
  const topCompetitors = competitors
    .map((c) => ({
      id: c.id,
      code: c.code,
      bunkeringCount: operations.filter((o) => o.competitor_id === c.id && o.operation_type === "STS_BUNKERING").length,
    }))
    .filter((c) => c.bunkeringCount > 0)
    .sort((a, b) => b.bunkeringCount - a.bunkeringCount)
    .slice(0, 6)

  const weeklyTrendMap = new Map<string, { label: string; [code: string]: number | string }>()
  operations
    .filter((o) => o.operation_type === "STS_BUNKERING" && topCompetitors.some((c) => c.id === o.competitor_id))
    .forEach((o) => {
      const { key, label } = isoWeekLabel(o.operation_date)
      const competitor = topCompetitors.find((c) => c.id === o.competitor_id)!
      if (!weeklyTrendMap.has(key)) weeklyTrendMap.set(key, { label })
      const row = weeklyTrendMap.get(key)!
      row[competitor.code] = ((row[competitor.code] as number) ?? 0) + 1
    })
  const weeklyTrendData = [...weeklyTrendMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-10)
    .map(([, row]) => row)

  // Month-over-month bunkering change per competitor, in plain language.
  const now = new Date()
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`
  const growth = competitors
    .map((c) => {
      const thisMonthCount = operations.filter(
        (o) => o.competitor_id === c.id && o.operation_type === "STS_BUNKERING" && o.operation_date >= thisMonthStart
      ).length
      const prevMonthCount = operations.filter(
        (o) =>
          o.competitor_id === c.id &&
          o.operation_type === "STS_BUNKERING" &&
          o.operation_date >= prevMonthStart &&
          o.operation_date < thisMonthStart
      ).length
      const pctChange = prevMonthCount > 0 ? Math.round(((thisMonthCount - prevMonthCount) / prevMonthCount) * 100) : null
      return { id: c.id, name: c.name, thisMonthCount, prevMonthCount, pctChange }
    })
    .filter((g) => g.thisMonthCount > 0 || g.prevMonthCount > 0)
    .sort((a, b) => (b.pctChange ?? -999) - (a.pctChange ?? -999))
    .slice(0, 5)

  // Barges with real history that have gone quiet — no bunkering in 30+ days.
  const thirtyDaysAgo = resolvePreset("last30").from
  const quietBarges = barges
    .map((b) => {
      const bargeOps = operations.filter((o) => o.barge_id === b.id && o.operation_type === "STS_BUNKERING")
      if (bargeOps.length === 0) return null
      const lastSeen = bargeOps.reduce((max, o) => (o.operation_date > max ? o.operation_date : max), bargeOps[0].operation_date)
      if (lastSeen >= thirtyDaysAgo) return null
      const competitor = competitors.find((c) => c.id === b.competitor_id)
      return { id: b.id, name: b.name, competitorName: competitor?.name ?? "—", lastSeen }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => (a.lastSeen < b.lastSeen ? -1 : 1))

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Observed competitor STS activity across all tracked barges."
      />

      <div className="px-6 grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Tracked Competitors" value={competitors.length} icon={Building2} tone="blue" />
        <KpiCard label="Tracked Barges" value={barges.length} icon={Sailboat} tone="teal" />
        <KpiCard label="Observed STS Operations" value={operations.length} icon={Radar} tone="orange" />
        <KpiCard label="Unique Vessels" value={uniqueVessels} icon={Ship} tone="green" />
        <Link to="/barges" className="block">
          <KpiCard
            label="Flagged Anomalies"
            value={anomalyCount}
            sublabel={anomalyCount > 0 ? "Different barge/vessel <5h — view in Barges" : "None detected"}
            icon={AlertTriangle}
            tone="red"
          />
        </Link>
      </div>

      <div className="px-6 mt-3 grid grid-cols-3 gap-3">
        <KpiCard label="Last 24H" value={countInRange(last24h.from, last24h.to)} icon={Clock} tone="cyan" />
        <KpiCard label="Last 7 Days" value={countInRange(last7.from, last7.to)} icon={CalendarDays} tone="purple" />
        <KpiCard label="This Month" value={countInRange(thisMonth.from, thisMonth.to)} icon={CalendarRange} tone="pink" />
      </div>

      <div className="px-6 mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl glass p-4">
          <div className="text-xs font-medium text-paper-500 mb-3">
            STS Activity by Day
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailySeries}>
              <CartesianGrid stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", fontSize: 12 }}
                labelStyle={{ color: "#0B1220" }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {dailySeries.map((_, i) => (
                  <Cell key={i} fill={CHART_HUES[i % CHART_HUES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl glass p-4">
          <div className="text-xs font-medium text-paper-500 mb-3">
            Activity by Competitor
          </div>
          <div className="space-y-2">
            {byCompetitor.map((c, i) => {
              const max = byCompetitor[0]?.count || 1
              const hue = CHART_HUES[i % CHART_HUES.length]
              return (
                <div key={c.name} className="flex items-center gap-2">
                  <span className="w-10 text-xs font-mono text-paper-300">{c.name}</span>
                  <div className="flex-1 h-2 rounded-md bg-ink-700 overflow-hidden">
                    <div
                      className="h-full rounded-md"
                      style={{ width: `${(c.count / max) * 100}%`, background: colorForCompetitor(c.id) }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-mono text-paper-500">{c.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="px-6 mt-4 rounded-xl glass p-4">
        <div className="text-xs font-medium text-paper-500 mb-3">
          STS Bunkering Trend by Competitor — Last 10 Weeks
        </div>
        {topCompetitors.length === 0 ? (
          <p className="text-sm text-paper-500 py-8 text-center">No STS Bunkering events recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyTrendData}>
              <CartesianGrid stroke="#E4E4E7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717A" }} axisLine={{ stroke: "#E4E4E7" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#71717A" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E4E4E7", fontSize: 12 }} labelStyle={{ color: "#18181B" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topCompetitors.map((c, i) => (
                <Bar key={c.id} dataKey={c.code} name={c.code} fill={colorForCompetitor(c.id)} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="px-6 mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl glass p-4">
          <div className="text-xs font-medium text-paper-500 mb-3">
            Who's Growing — This Month vs Last Month
          </div>
          {growth.length === 0 ? (
            <p className="text-sm text-paper-500 py-6 text-center">Not enough history yet to compare months.</p>
          ) : (
            <div className="space-y-2.5">
              {growth.map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colorForCompetitor(g.id) }} />
                    {g.name}
                  </span>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      g.pctChange === null
                        ? "text-paper-500"
                        : g.pctChange > 0
                          ? "text-signal-ok"
                          : g.pctChange < 0
                            ? "text-signal-crit"
                            : "text-paper-500"
                    }`}
                  >
                    {g.pctChange === null
                      ? `New this month (${g.thisMonthCount})`
                      : `${g.pctChange > 0 ? "+" : ""}${g.pctChange}% (${g.prevMonthCount} → ${g.thisMonthCount})`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl glass p-4">
          <div className="text-xs font-medium text-paper-500 mb-3">
            Quiet Barges — No Bunkering in 30+ Days
          </div>
          {quietBarges.length === 0 ? (
            <p className="text-sm text-paper-500 py-6 text-center">Every barge with history has been active in the last 30 days.</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto scrollbar-thin">
              {quietBarges.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span>
                    {b.name} <span className="text-paper-500 text-xs">· {b.competitorName}</span>
                  </span>
                  <span className="font-mono text-xs text-signal-warn">since {formatDateDisplay(b.lastSeen)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 mt-4 mb-8 flex items-center justify-between text-xs text-paper-500">
        <span>
          Latest observed activity:{" "}
          {latestActivity ? formatDateDisplay(latestActivity) : "No data available."}
        </span>
        <Link to="/sts-analysis" className="text-brand-600 hover:underline">
          Run competitor analysis →
        </Link>
      </div>
    </div>
  )
}
