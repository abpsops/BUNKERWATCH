export interface VesselFix {
  mmsi: number
  imo: string | null
  name: string | null
  latitude: number
  longitude: number
  speedKnots: number | null
  timestamp: number // epoch ms
  // Optional extras carried through to vessel_positions for the Live Map.
  courseDeg?: number | null
  headingDeg?: number | null
  navStatus?: number | null
  shipType?: number | null
  destination?: string | null
  source?: "aisstream" | "shipfinder"
  extras?: {
    callSign: string | null
    lengthM: number | null
    widthM: number | null
    draughtM: number | null
    eta: string | null
    destCode: string | null
  }
}

export interface DetectedEncounter {
  bargeMmsi: number
  bargeImo: string
  otherMmsi: number
  otherImo: string | null
  otherName: string | null
  startTime: number
  endTime: number
  location: string
  latitude: number
  longitude: number
}

// Tuned conservatively: false negatives (missing a real STS event) are far
// less damaging to trust in this tool than false positives (accusing a
// competitor of bunkering when two ships just anchored near each other).
export const PROXIMITY_METERS = 400
export const MAX_SPEED_KNOTS = 1.0
export const MIN_DURATION_MS = 45 * 60 * 1000 // 45 minutes
export const STALE_TIMEOUT_MS = 20 * 60 * 1000 // 20 minutes without an update ends tracking

const NAMED_LOCATIONS: { name: string; lat: number; lon: number }[] = [
  { name: "Fujairah Anchorage", lat: 25.12, lon: 56.38 },
  { name: "Khor Fakkan", lat: 25.35, lon: 56.36 },
  { name: "Port Rashid", lat: 25.27, lon: 55.28 },
  { name: "Jebel Ali", lat: 25.01, lon: 55.06 },
  { name: "Sharjah Anchorage", lat: 25.36, lon: 55.42 },
]

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Nearest known anchorage/port name — approximate, for a human-readable location field only. */
export function nearestLocationName(lat: number, lon: number): string {
  let best = NAMED_LOCATIONS[0]
  let bestDist = Infinity
  for (const loc of NAMED_LOCATIONS) {
    const d = haversineMeters(lat, lon, loc.lat, loc.lon)
    if (d < bestDist) {
      bestDist = d
      best = loc
    }
  }
  return best.name
}

interface OngoingEncounter {
  bargeMmsi: number
  bargeImo: string
  otherMmsi: number
  otherImo: string | null
  otherName: string | null
  firstSeen: number
  lastSeen: number
  lastLat: number
  lastLon: number
}

/**
 * Tracks proximity between tracked barges and any other vessel. An
 * encounter opens when both are within PROXIMITY_METERS and both report
 * speed under MAX_SPEED_KNOTS; it closes (and is emitted as a candidate
 * STS event) once it has lasted at least MIN_DURATION_MS and then either
 * the pair separates or goes stale.
 */
export class EncounterTracker {
  private ongoing = new Map<string, OngoingEncounter>()

  private key(bargeMmsi: number, otherMmsi: number) {
    return `${bargeMmsi}:${otherMmsi}`
  }

  /** Call whenever a barge and a candidate "other vessel" fix are both fresh. */
  update(barge: VesselFix, other: VesselFix): DetectedEncounter | null {
    if (barge.mmsi === other.mmsi) return null
    const key = this.key(barge.mmsi, other.mmsi)
    const distance = haversineMeters(barge.latitude, barge.longitude, other.latitude, other.longitude)
    const bothSlow =
      (barge.speedKnots ?? 99) <= MAX_SPEED_KNOTS && (other.speedKnots ?? 99) <= MAX_SPEED_KNOTS
    const isClose = distance <= PROXIMITY_METERS

    const existing = this.ongoing.get(key)

    if (isClose && bothSlow) {
      if (existing) {
        existing.lastSeen = Math.max(barge.timestamp, other.timestamp)
        existing.lastLat = barge.latitude
        existing.lastLon = barge.longitude
      } else {
        this.ongoing.set(key, {
          bargeMmsi: barge.mmsi,
          bargeImo: barge.imo!,
          otherMmsi: other.mmsi,
          otherImo: other.imo,
          otherName: other.name,
          firstSeen: Math.min(barge.timestamp, other.timestamp),
          lastSeen: Math.max(barge.timestamp, other.timestamp),
          lastLat: barge.latitude,
          lastLon: barge.longitude,
        })
      }
      return null
    }

    // No longer close/slow — close out the encounter if it was long enough.
    if (existing) {
      this.ongoing.delete(key)
      return this.emitIfQualifying(existing)
    }
    return null
  }

  /** Call periodically to close encounters that have gone stale (no updates, but never explicitly separated). */
  sweepStale(now: number): DetectedEncounter[] {
    const results: DetectedEncounter[] = []
    for (const [key, enc] of this.ongoing) {
      if (now - enc.lastSeen > STALE_TIMEOUT_MS) {
        this.ongoing.delete(key)
        const emitted = this.emitIfQualifying(enc)
        if (emitted) results.push(emitted)
      }
    }
    return results
  }

  private emitIfQualifying(enc: OngoingEncounter): DetectedEncounter | null {
    if (enc.lastSeen - enc.firstSeen < MIN_DURATION_MS) return null
    return {
      bargeMmsi: enc.bargeMmsi,
      bargeImo: enc.bargeImo,
      otherMmsi: enc.otherMmsi,
      otherImo: enc.otherImo,
      otherName: enc.otherName,
      startTime: enc.firstSeen,
      endTime: enc.lastSeen,
      location: nearestLocationName(enc.lastLat, enc.lastLon),
      latitude: enc.lastLat,
      longitude: enc.lastLon,
    }
  }
}
