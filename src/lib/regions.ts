export type BargeRegion = "FUJ" | "KFK" | "OMAN" | "UNASSIGNED"

/** Display order requested: Fujairah, then Khor Fakkan, then everywhere in Oman, then anything with no location data at all. */
export const REGION_ORDER: BargeRegion[] = ["FUJ", "KFK", "OMAN", "UNASSIGNED"]

export const REGION_LABELS: Record<BargeRegion, string> = {
  FUJ: "FUJ — Fujairah",
  KFK: "KFK — Khor Fakkan",
  OMAN: "OMAN — Sohar / Salalah / Shinas / Al Duqm",
  UNASSIGNED: "No Location Data Yet",
}

// Substring match, case-insensitive — covers every Omani port named plus a
// bare "Oman" mention, so a location string doesn't need to exactly equal
// one of these to be classified correctly.
const OMAN_PORT_HINTS = ["sohar", "salalah", "shinas", "duqm", "oman"]

/** Classifies a single location string (e.g. from one STSOperation) into a region. */
export function regionForLocation(location: string | null | undefined): BargeRegion {
  if (!location) return "UNASSIGNED"
  const l = location.toLowerCase()
  if (l.includes("fujairah") || l === "fuj") return "FUJ"
  if (l.includes("khor fakkan") || l === "kfk") return "KFK"
  if (OMAN_PORT_HINTS.some((hint) => l.includes(hint))) return "OMAN"
  return "UNASSIGNED"
}

/**
 * A barge doesn't have one fixed location of its own — location lives on
 * each individual operation — so a barge's region is whichever region its
 * operations most frequently fall under. A barge with no operations yet
 * (nothing uploaded/analysed) has no data to go on, so it's UNASSIGNED.
 */
export function regionForBargeOperations(operations: { location?: string | null }[]): BargeRegion {
  if (!operations.length) return "UNASSIGNED"
  const counts = new Map<BargeRegion, number>()
  operations.forEach((o) => {
    const r = regionForLocation(o.location)
    counts.set(r, (counts.get(r) ?? 0) + 1)
  })
  let best: BargeRegion = "UNASSIGNED"
  let bestCount = -1
  REGION_ORDER.forEach((r) => {
    const c = counts.get(r) ?? 0
    if (c > bestCount) {
      bestCount = c
      best = r
    }
  })
  return best
}
