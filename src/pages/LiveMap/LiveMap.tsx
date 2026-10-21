import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Radio, Anchor, Navigation, Search } from "lucide-react"
import clsx from "clsx"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import { colorForCompetitor } from "@/lib/competitorColors"
import { useLivePositions, type LivePosition, type LiveStatus } from "@/hooks/useLivePositions"

const FUJAIRAH_CENTER: [number, number] = [25.15, 56.5]

// AIS ship-type codes: 80–89 tanker, 70–79 cargo, 50–59 service/tug/pilot, 30–37 fishing/towing/etc.
type Category = "barge" | "tanker" | "cargo" | "service" | "other"
const CATEGORY_LABEL: Record<Category, string> = {
  barge: "Tracked barges",
  tanker: "Tankers",
  cargo: "Cargo ships",
  service: "Tugs & service",
  other: "Other",
}
const CATEGORY_COLOR: Record<Exclude<Category, "barge">, string> = {
  tanker: "#0D9488",
  cargo: "#2C5478",
  service: "#B45309",
  other: "#7F8E9C",
}

function categorize(p: LivePosition, trackedMmsi: Set<number>, trackedImo: Set<string>): Category {
  if (trackedMmsi.has(p.mmsi) || (p.imo && trackedImo.has(p.imo))) return "barge"
  const t = p.ship_type ?? 0
  if (t >= 80 && t <= 89) return "tanker"
  if (t >= 70 && t <= 79) return "cargo"
  if ((t >= 50 && t <= 59) || (t >= 30 && t <= 37)) return "service"
  return "other"
}

const NAV_STATUS: Record<number, string> = {
  0: "Under way",
  1: "At anchor",
  2: "Not under command",
  3: "Restricted manoeuvrability",
  5: "Moored",
  8: "Under way (sailing)",
}

function isStationary(p: LivePosition) {
  return (p.speed_knots ?? 0) < 0.5 || p.nav_status === 1 || p.nav_status === 5
}

function ageLabel(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`
}

const iconCache = new Map<string, L.DivIcon>()
function vesselIcon(color: string, rotation: number | null, stationary: boolean, emphasised: boolean) {
  const key = `${color}|${rotation ?? "x"}|${stationary}|${emphasised}`
  const cached = iconCache.get(key)
  if (cached) return cached
  const size = emphasised ? 22 : 14
  const stroke = emphasised ? "#0A1A2A" : "#FFFFFF"
  const svg = stationary
    ? `<svg width="${size}" height="${size}" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="${color}" stroke="${stroke}" stroke-width="2"/></svg>`
    : `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="transform:rotate(${rotation ?? 0}deg)"><path d="M10 1 L17 18 L10 14 L3 18 Z" fill="${color}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/></svg>`
  const icon = L.divIcon({ html: svg, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
  iconCache.set(key, icon)
  return icon
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 13, { duration: 0.8 })
  }, [map, target])
  return null
}

function StatusChip({ status, lastEventAt }: { status: LiveStatus; lastEventAt: number | null }) {
  const tone = {
    demo: "bg-ink-800 text-paper-500",
    connecting: "bg-amber-50 text-amber-700",
    live: "bg-emerald-50 text-emerald-700",
    reconnecting: "bg-amber-50 text-amber-700",
  }[status]
  const text = {
    demo: "Demo mode — connect Supabase for live AIS",
    connecting: "Connecting…",
    live: lastEventAt ? `Live · updated ${ageLabel(new Date(lastEventAt).toISOString())}` : "Live",
    reconnecting: "Reconnecting…",
  }[status]
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", tone)}>
      <Radio className={clsx("h-3.5 w-3.5", status === "live" && "animate-pulse")} />
      {text}
    </span>
  )
}

export default function LiveMap() {
  const provider = getDataProvider()
  const { data: barges = [] } = useQuery({ queryKey: ["barges"], queryFn: () => provider.getBarges() })
  const { data: competitors = [] } = useQuery({ queryKey: ["competitors"], queryFn: () => provider.getCompetitors() })
  const { positions, status, lastEventAt } = useLivePositions()

  const [visible, setVisible] = useState<Record<Category, boolean>>({ barge: true, tanker: true, cargo: true, service: true, other: true })
  const [search, setSearch] = useState("")
  const [focus, setFocus] = useState<[number, number] | null>(null)

  const trackedMmsi = useMemo(() => new Set(barges.filter((b) => b.mmsi).map((b) => Number(b.mmsi))), [barges])
  const trackedImo = useMemo(() => new Set(barges.map((b) => b.imo)), [barges])
  const bargeByKey = useMemo(() => {
    const m = new Map<string, (typeof barges)[number]>()
    barges.forEach((b) => {
      m.set(`imo:${b.imo}`, b)
      if (b.mmsi) m.set(`mmsi:${b.mmsi}`, b)
    })
    return m
  }, [barges])
  const competitorName = (id: string) => competitors.find((c) => c.id === id)?.name ?? "—"

  const vessels = useMemo(() => {
    const q = search.trim().toUpperCase()
    const out: { p: LivePosition; cat: Category; color: string; barge: (typeof barges)[number] | null }[] = []
    for (const p of positions.values()) {
      const cat = categorize(p, trackedMmsi, trackedImo)
      if (!visible[cat]) continue
      if (q && !(p.name ?? "").toUpperCase().includes(q) && !String(p.mmsi).includes(q) && !(p.imo ?? "").includes(q)) continue
      const barge = cat === "barge" ? bargeByKey.get(`mmsi:${p.mmsi}`) ?? bargeByKey.get(`imo:${p.imo}`) ?? null : null
      const color = barge ? colorForCompetitor(barge.competitor_id) : CATEGORY_COLOR[cat as Exclude<Category, "barge">]
      out.push({ p, cat, color, barge })
    }
    return out
  }, [positions, visible, search, trackedMmsi, trackedImo, bargeByKey])

  const counts = useMemo(() => {
    const c: Record<Category, number> = { barge: 0, tanker: 0, cargo: 0, service: 0, other: 0 }
    for (const p of positions.values()) c[categorize(p, trackedMmsi, trackedImo)]++
    return c
  }, [positions, trackedMmsi, trackedImo])

  const trackedOnMap = vessels.filter((v) => v.cat === "barge").sort((a, b) => (a.p.name ?? "").localeCompare(b.p.name ?? ""))

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Live Map"
        subtitle="Every AIS-broadcasting vessel in the Fujairah / Khor Fakkan box, updated as the worker receives it."
        actions={<StatusChip status={status} lastEventAt={lastEventAt} />}
      />

      <div className="grid flex-1 gap-4 px-6 pb-10 lg:grid-cols-[280px_1fr]">
        <aside className="glass flex flex-col rounded-xl p-4 lg:max-h-[calc(100vh-200px)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-paper-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, MMSI or IMO"
              className="focus-ring w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-3 text-sm"
            />
          </label>

          <ul className="mt-4 space-y-1.5">
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
              <li key={cat}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-ink-800">
                  <input type="checkbox" checked={visible[cat]} onChange={() => setVisible((v) => ({ ...v, [cat]: !v[cat] }))} />
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: cat === "barge" ? "linear-gradient(135deg,#6366F1,#F59E0B,#10B981)" : CATEGORY_COLOR[cat] }}
                  />
                  <span className="flex-1">{CATEGORY_LABEL[cat]}</span>
                  <span className="tabular-nums text-xs text-paper-500">{counts[cat]}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-ink-700 pt-4">
            <p className="text-xs text-paper-500">
              Tracked barges on AIS now: {trackedOnMap.length} of {barges.length}
            </p>
            <ul className="scrollbar-thin mt-2 flex-1 space-y-1 overflow-y-auto text-sm">
              {trackedOnMap.map(({ p, barge, color }) => (
                <li key={p.mmsi}>
                  <button
                    onClick={() => setFocus([p.latitude, p.longitude])}
                    className="focus-ring flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-ink-800"
                  >
                    {isStationary(p) ? <Anchor className="h-3.5 w-3.5 shrink-0" style={{ color }} /> : <Navigation className="h-3.5 w-3.5 shrink-0" style={{ color }} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{barge?.name ?? p.name ?? p.mmsi}</span>
                      <span className="block truncate text-xs text-paper-500">
                        {barge ? competitorName(barge.competitor_id) : "—"} · {(p.speed_knots ?? 0).toFixed(1)} kn
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {trackedOnMap.length === 0 && <li className="px-1.5 text-xs text-paper-500">None visible right now.</li>}
            </ul>
          </div>
        </aside>

        <div className="glass overflow-hidden rounded-xl" style={{ minHeight: 560 }}>
          <MapContainer center={FUJAIRAH_CENTER} zoom={10} style={{ height: "100%", width: "100%", minHeight: 560 }}>
            <FlyTo target={focus} />
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {vessels.map(({ p, cat, color, barge }) => (
              <Marker
                key={p.mmsi}
                position={[p.latitude, p.longitude]}
                icon={vesselIcon(color, p.heading_deg ?? p.course_deg, isStationary(p), cat === "barge")}
                zIndexOffset={cat === "barge" ? 1000 : 0}
              >
                <Popup>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <strong>{barge?.name ?? p.name ?? `MMSI ${p.mmsi}`}</strong>
                    {barge && (
                      <>
                        <br />
                        <span style={{ color }}>{competitorName(barge.competitor_id)}</span> · tracked barge
                      </>
                    )}
                    <br />
                    MMSI {p.mmsi}
                    {p.imo && <> · IMO {p.imo}</>}
                    <br />
                    {(p.speed_knots ?? 0).toFixed(1)} kn
                    {p.course_deg !== null && <> · COG {Math.round(p.course_deg)}°</>}
                    {p.nav_status !== null && NAV_STATUS[p.nav_status] && <> · {NAV_STATUS[p.nav_status]}</>}
                    {p.destination && (
                      <>
                        <br />
                        Dest: {p.destination}
                      </>
                    )}
                    <br />
                    <span style={{ color: "#7F8E9C" }}>{ageLabel(p.received_at)}</span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}
