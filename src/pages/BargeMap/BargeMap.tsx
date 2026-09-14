import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { getDataProvider } from "@/services/data"
import PageHeader from "@/components/ui/PageHeader"
import { colorForCompetitor } from "@/lib/competitorColors"
import { formatDateDisplay } from "@/lib/dates"

const FUJAIRAH_CENTER: [number, number] = [25.15, 56.5]

export default function BargeMap() {
  const provider = getDataProvider()
  const { data: barges = [] } = useQuery({ queryKey: ["barges"], queryFn: () => provider.getBarges() })
  const { data: competitors = [] } = useQuery({ queryKey: ["competitors"], queryFn: () => provider.getCompetitors() })
  const { data: operations = [] } = useQuery({ queryKey: ["operations-all"], queryFn: () => provider.getSTSOperations({}) })

  const competitorName = (id: string) => competitors.find((c) => c.id === id)?.name ?? "—"

  const lastKnownPositions = useMemo(() => {
    const byBarge = new Map<string, (typeof operations)[number]>()
    operations
      .filter((o) => o.latitude !== null && o.longitude !== null)
      .forEach((o) => {
        const existing = byBarge.get(o.barge_id)
        if (!existing || o.operation_date > existing.operation_date) byBarge.set(o.barge_id, o)
      })
    return barges
      .map((b) => {
        const lastOp = byBarge.get(b.id)
        if (!lastOp) return null
        return { barge: b, op: lastOp }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [barges, operations])

  const withoutPosition = barges.length - lastKnownPositions.length

  return (
    <div>
      <PageHeader
        title="Barge Map"
        subtitle="Each barge's last known position from your uploaded STS data — not live tracking."
      />

      <div className="px-6 pb-10">
        <div className="rounded-xl glass overflow-hidden" style={{ height: 560 }}>
          <MapContainer center={FUJAIRAH_CENTER} zoom={9} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {lastKnownPositions.map(({ barge, op }) => (
              <CircleMarker
                key={barge.id}
                center={[op.latitude!, op.longitude!]}
                radius={7}
                pathOptions={{
                  color: colorForCompetitor(barge.competitor_id),
                  fillColor: colorForCompetitor(barge.competitor_id),
                  fillOpacity: 0.85,
                  weight: 2,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 12 }}>
                    <strong>{barge.name}</strong>
                    <br />
                    {competitorName(barge.competitor_id)}
                    <br />
                    Last seen: {formatDateDisplay(op.operation_date)}
                    <br />
                    {op.location ?? "Location unknown"}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <p className="mt-3 text-xs text-paper-500">
          Showing {lastKnownPositions.length} of {barges.length} barges with a recorded position.
          {withoutPosition > 0 && ` ${withoutPosition} barge${withoutPosition === 1 ? " has" : "s have"} no position data yet — upload their STS export to place them on the map.`}
        </p>
      </div>
    </div>
  )
}
