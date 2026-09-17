/**
 * Fixed watchlist behind the "Track -FKO" section — the vessel names come
 * straight from the "Barge List Per Ports" report (FUJ / KFK / OMAN
 * deployment groupings). The report gives no company or IMO for any of
 * them, so those are filled in on the page itself once a vessel is added
 * as a tracked barge; this file only holds what the report actually
 * contains: which port(s) — and for Oman, which specific anchorage — each
 * name is deployed to.
 */

export type TrackFkoPort = "FUJ" | "KFK" | "OMAN"

export interface TrackFkoCall {
  port: TrackFkoPort
  /** Oman entries carry a specific destination anchorage; FUJ/KFK don't need one. */
  destination?: string
}

export interface TrackFkoGroupEntry {
  name: string
  destination?: string
}

const FUJ_NAMES: string[] = [
  "ABC TRADER", "AMAL", "AMBER", "BRAVO", "CECILE", "CELESTA", "CHASER", "CORA", "COYA",
  "DAISY", "FALDA", "FRANCIE", "HEREDIA SEA", "ICONIC 1", "MARINE XENA", "MATURITY ONE",
  "MATURITY TWO", "MONJASA SHIPPER", "SAL", "SIENE", "SILVA", "SORRELLE", "VEMAGRACE",
  "VISTA III", "ZUMA",
]

const KFK_NAMES: string[] = [
  "ABC SUN", "ANDES", "CASPER", "COYA", "ELENA 1", "ETON", "KAWA KAWA", "MT CAVENDISH",
  "NYALA", "SEA SHORE",
]

const OMAN_ENTRIES: TrackFkoGroupEntry[] = [
  { name: "ALEJANDRINA 1", destination: "SHINAS" },
  { name: "COYA", destination: "SALALAH" },
  { name: "ELENA 1", destination: "SOHAR" },
  { name: "GAIA", destination: "SOHAR" },
  { name: "HIDE", destination: "SOHAR" },
  { name: "MARGHERITA COSULICH", destination: "AL DUQM" },
  { name: "MONJASA SHIPPER", destination: "SALALAH" },
  { name: "MT KURT MAS", destination: "SOHAR" },
  { name: "ROSETTA", destination: "SOHAR" },
  { name: "SAL", destination: "SALALAH" },
  { name: "SWAN", destination: "SALALAH" },
]

export const TRACK_FKO_GROUPS: { port: TrackFkoPort; label: string; entries: TrackFkoGroupEntry[] }[] = [
  { port: "FUJ", label: "FUJ PORT", entries: FUJ_NAMES.map((name) => ({ name })) },
  { port: "KFK", label: "KFK PORT", entries: KFK_NAMES.map((name) => ({ name })) },
  { port: "OMAN", label: "OMAN PORTS", entries: OMAN_ENTRIES },
]

/** Every distinct vessel name across all three groups (a name may appear in more than one). */
export const TRACK_FKO_ALL_NAMES: string[] = Array.from(
  new Set(TRACK_FKO_GROUPS.flatMap((g) => g.entries.map((e) => e.name)))
)

/** Case/whitespace-insensitive match against the watchlist. */
export function isTrackFkoVessel(name: string): boolean {
  const n = name.trim().toUpperCase()
  return TRACK_FKO_ALL_NAMES.some((w) => w.toUpperCase() === n)
}
