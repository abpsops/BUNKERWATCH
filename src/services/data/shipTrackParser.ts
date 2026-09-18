import * as XLSX from "xlsx"
import type { Barge, STSOperation } from "@/types"

export interface ShipTrackRow {
  mmsi: number
  imo: string
  name: string
  timestamp: Date
  latitude: number
  longitude: number
  narrative: string
  destination: string
}

const REQUIRED_HEADERS = ["Mmsi", "Imo", "Name", "LastUpdateReceived", "Narrative"]

// Known anchorages/ports relevant to Fujairah-area bunkering — matches the
// same list the AIS worker uses, plus the Oman ports Jameel named.
const NAMED_LOCATIONS: { name: string; lat: number; lon: number }[] = [
  { name: "Fujairah", lat: 25.12, lon: 56.38 },
  { name: "Khor Fakkan", lat: 25.35, lon: 56.36 },
  { name: "Sohar", lat: 24.47, lon: 56.61 },
  { name: "Salalah", lat: 17.02, lon: 54.09 },
  { name: "Al Duqm", lat: 19.65, lon: 57.7 },
]
// Beyond this, a nearest-match is meaningless (e.g. a garbled AIS ping near
// 0,0) — report "Unknown" rather than a misleading location.
const MAX_MATCH_METERS = 150_000

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function nearestNamedLocation(lat: number, lon: number): string {
  let best = NAMED_LOCATIONS[0].name
  let bestDist = Infinity
  for (const loc of NAMED_LOCATIONS) {
    const d = haversineMeters(lat, lon, loc.lat, loc.lon)
    if (d < bestDist) {
      bestDist = d
      best = loc.name
    }
  }
  return bestDist <= MAX_MATCH_METERS ? best : "Unknown"
}

// The GPS fix on the exact ping that logs an STS Bunkering event is
// sometimes garbled (a jump to somewhere like 0°N 0°E) — that's a data
// glitch on that one reading, not the barge teleporting there, and it's
// exactly the kind of AIS anomaly this app already watches for. Rather
// than reporting "Unknown" for the whole operation, fall back to the
// closest-in-time OTHER reading in the same track that DOES resolve to a
// known port. A barge isn't fixed to one home port — it can genuinely be
// at Fujairah, Khor Fakkan, or any of the Oman ports on a given trip — so
// this always follows whatever the surrounding pings actually show.
function nearestValidLocation(rows: ShipTrackRow[], targetIndex: number): string {
  const target = rows[targetIndex]
  let best: { location: string; deltaMs: number } | null = null
  for (let i = 0; i < rows.length; i++) {
    if (i === targetIndex) continue
    const location = nearestNamedLocation(rows[i].latitude, rows[i].longitude)
    if (location === "Unknown") continue
    const deltaMs = Math.abs(rows[i].timestamp.getTime() - target.timestamp.getTime())
    if (!best || deltaMs < best.deltaMs) best = { location, deltaMs }
  }
  return best ? best.location : "Unknown"
}

/** Reads the sheet as a raw grid and finds the real header row, since row 1 is a report banner, not data. */
export async function parseShipTrackFile(file: File): Promise<{ isShipTrackFormat: boolean; rows: ShipTrackRow[] }> {
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf, { type: "array", cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

  const headerRowIndex = grid.findIndex(
    (row) => REQUIRED_HEADERS.every((h) => row.some((cell) => String(cell).trim() === h))
  )
  if (headerRowIndex === -1) return { isShipTrackFormat: false, rows: [] }

  const headers = grid[headerRowIndex].map((h) => String(h).trim())
  const col = (name: string) => headers.indexOf(name)
  const idx = {
    mmsi: col("Mmsi"),
    imo: col("Imo"),
    name: col("Name"),
    timestamp: col("LastUpdateReceived"),
    lat: col("Latitude"),
    lon: col("Longitude"),
    narrative: col("Narrative"),
    destination: col("Destination"),
  }

  const rows: ShipTrackRow[] = []
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const r = grid[i]
    if (!r || r.length === 0) continue
    const ts = r[idx.timestamp]
    const timestamp = ts instanceof Date ? ts : new Date(String(ts))
    if (isNaN(timestamp.getTime())) continue

    rows.push({
      mmsi: Number(r[idx.mmsi]),
      imo: String(r[idx.imo] ?? "").trim(),
      name: String(r[idx.name] ?? "").trim(),
      timestamp,
      latitude: Number(r[idx.lat]),
      longitude: Number(r[idx.lon]),
      narrative: String(r[idx.narrative] ?? ""),
      destination: String(r[idx.destination] ?? "").trim(),
    })
  }

  return { isShipTrackFormat: true, rows }
}

export interface BunkeringExtraction {
  vesselName: string
  timestamp: Date
  location: string
  latitude: number
  longitude: number
}

const BUNKERING_PATTERN = /STS Operation Bunkering with (.+)/i

/** Pulls out only STS Bunkering narratives — explicitly excludes "STS Operation Supply" and everything else. */
export function extractBunkeringEvents(rows: ShipTrackRow[]): BunkeringExtraction[] {
  const results: BunkeringExtraction[] = []
  rows.forEach((row, i) => {
    const match = row.narrative.match(BUNKERING_PATTERN)
    if (!match) return
    // The narrative's vessel name is followed by a literal "\n" text
    // sequence (two characters: backslash, then n) before the date line —
    // not an actual line-break character — confirmed against a real
    // ShipTrackExport file.
    const vesselName = match[1].split("\\n")[0].trim()
    if (!vesselName) return
    let location = nearestNamedLocation(row.latitude, row.longitude)
    if (location === "Unknown") location = nearestValidLocation(rows, i)
    results.push({
      vesselName,
      timestamp: row.timestamp,
      location,
      latitude: row.latitude,
      longitude: row.longitude,
    })
  })
  return results
}

// AIS/ship-tracking timestamps are recorded in UTC; Fujairah operations run
// on Asia/Dubai time (a fixed UTC+4 offset, no daylight saving), so convert
// before splitting into date/time strings rather than showing raw UTC.
export function toDubaiDateTimeParts(date: Date): { date: string; time: string } {
  const shifted = new Date(date.getTime() + 4 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const d = String(shifted.getUTCDate()).padStart(2, "0")
  const h = String(shifted.getUTCHours()).padStart(2, "0")
  const mi = String(shifted.getUTCMinutes()).padStart(2, "0")
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }
}

export function toSTSOperations(
  extractions: BunkeringExtraction[],
  barge: Barge,
  competitorName: string,
  sourceFilename: string
): Omit<STSOperation, "id" | "created_at" | "updated_at">[] {
  return extractions.map((e) => {
    const { date, time } = toDubaiDateTimeParts(e.timestamp)
    return {
      organization_id: barge.organization_id,
      barge_id: barge.id,
      barge_imo: barge.imo,
      barge_name: barge.name,
      competitor_id: barge.competitor_id,
      competitor_name: competitorName,
      receiving_vessel_id: null,
      receiving_vessel_imo: "",
      receiving_vessel_name: e.vesselName,
      operation_date: date,
      start_time: time,
      end_time: null,
      duration_minutes: null,
      location: e.location,
      latitude: e.latitude,
      longitude: e.longitude,
      operation_type: "STS_BUNKERING",
      raw_operation_label: "STS Operation Bunkering",
      source_provider: sourceFilename,
      source_record_id: null,
      confidence: "high",
    }
  })
}
