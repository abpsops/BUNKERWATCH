import type { STSOperation } from "@/types"

interface GapPair {
  a: number // earlier item's index into the original array
  b: number // later item's index into the original array
  gapMs: number
}

/**
 * Groups `items` by `primaryGroupKeyFn` (e.g. "same barge" or "same
 * vessel"), sorts each group chronologically, and returns every pair of
 * consecutive items in a group that are less than `minGapHours` apart AND
 * differ on `secondaryKeyFn` (e.g. a different vessel, or a different
 * barge). `items` does not need to be pre-sorted.
 */
function findShortGapPairs<T>(
  items: T[],
  primaryGroupKeyFn: (item: T) => string,
  timestampFn: (item: T) => number | null,
  secondaryKeyFn: (item: T) => string,
  minGapHours: number
): GapPair[] {
  const pairs: GapPair[] = []
  const byGroup = new Map<string, number[]>() // groupKey -> original indices
  items.forEach((item, i) => {
    const key = primaryGroupKeyFn(item)
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(i)
  })

  const minGapMs = minGapHours * 60 * 60 * 1000

  byGroup.forEach((indices) => {
    const withTs = indices
      .map((i) => ({ i, ts: timestampFn(items[i]) }))
      .filter((x): x is { i: number; ts: number } => x.ts !== null)
      .sort((a, b) => a.ts - b.ts)

    for (let k = 1; k < withTs.length; k++) {
      const gapMs = withTs[k].ts - withTs[k - 1].ts
      const sameSecondary = secondaryKeyFn(items[withTs[k - 1].i]) === secondaryKeyFn(items[withTs[k].i])
      if (gapMs >= 0 && gapMs < minGapMs && !sameSecondary) {
        pairs.push({ a: withTs[k - 1].i, b: withTs[k].i, gapMs })
      }
    }
  })

  return pairs
}

/**
 * Generic gap-based anomaly detector — same rule as findShortGapPairs
 * above, flattened down to just the set of flagged indices (both members
 * of every too-close pair). Kept as its own function/export because it's
 * a simpler, more ergonomic API for callers (Barges table badge, Vessels
 * page row highlighting, Dashboard KPI count) that only need to know
 * "is this row flagged", not why.
 */
export function findShortGapFlags<T>(
  items: T[],
  primaryGroupKeyFn: (item: T) => string,
  timestampFn: (item: T) => number | null,
  secondaryKeyFn: (item: T) => string,
  minGapHours = 5
): Set<number> {
  const flagged = new Set<number>()
  findShortGapPairs(items, primaryGroupKeyFn, timestampFn, secondaryKeyFn, minGapHours).forEach((p) => {
    flagged.add(p.a)
    flagged.add(p.b)
  })
  return flagged
}

/** Millisecond timestamp for an STSOperation's start, or null if unparseable. */
function opTimestamp(op: Pick<STSOperation, "operation_date" | "start_time">): number | null {
  if (!op.start_time) return null
  const t = new Date(`${op.operation_date}T${op.start_time}:00`).getTime()
  return isNaN(t) ? null : t
}

/**
 * The key used everywhere in the app to identify "the same vessel" — IMO
 * when known, name otherwise. Real uploaded/parsed data never actually
 * has a vessel IMO (only the barge's own IMO is known; the receiving
 * vessel's IMO field is always empty from shipTrackParser.ts), so in
 * practice this almost always falls back to the name.
 *
 * Two independently-parsed files can extract the same vessel's name with
 * a trivial formatting difference (different case, doubled internal
 * spaces, a stray non-breaking space) even though a human reading both
 * would call them obviously the same ship — so the name side of the
 * comparison is normalized (trimmed, whitespace-collapsed, uppercased)
 * rather than compared as a raw string. This is purely for matching;
 * displayed vessel names elsewhere in the app are untouched.
 */
/**
 * Normalizes just the name side of a vessel identity — collapses
 * non-breaking spaces, trims, collapses internal whitespace runs, and
 * uppercases. Exposed separately from vesselIdentityKey() because some
 * comparisons (see ownBarge.ts) specifically need "same name" regardless
 * of whether either side happens to carry an IMO, rather than
 * vesselIdentityKey's IMO-takes-precedence behavior.
 */
export function normalizeVesselName(name: string): string {
  return name
    .replace(/\u00A0/g, " ") // non-breaking space -> regular space
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
}

export function vesselIdentityKey(op: Pick<STSOperation, "receiving_vessel_imo" | "receiving_vessel_name">): string {
  if (op.receiving_vessel_imo) return op.receiving_vessel_imo.trim()
  return normalizeVesselName(op.receiving_vessel_name)
}

/** "125 minutes" -> "2h 5m" / "45 minutes" -> "45m" / "180 minutes" -> "3h" */
function formatGap(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export interface AnomalyExplanation {
  /** Indices into the operations array of the two flagged operations, earlier first. */
  indices: [number, number]
  reasonType: "same_barge_different_vessel" | "same_vessel_different_barge"
  gapMinutes: number
  /** Pre-formatted for display, e.g. "1h 5m" or "45m". */
  gapLabel: string
  /** One-line, human-readable explanation for a report reader with no code context. */
  summary: string
}

/**
 * Explains every flagged pair in plain language, for a report reader who
 * has no idea what "gap-based anomaly detection" means — just the two
 * operations involved, how close together they were, and which of the
 * two implausible patterns applies:
 *
 *  - same barge, different vessel, < minGapHours apart (a barge can't
 *    finish one ship and start a completely different one that fast), or
 *  - same vessel, different barge, < minGapHours apart (a vessel can't be
 *    bunkered by two different physical barges that close together).
 *
 * The only combination that's NOT flagged is the SAME barge servicing the
 * SAME vessel across a short gap — that's normal multi-grade bunkering
 * (e.g. VLSFO then MGO back to back), not a spoofing signal.
 */
export function findOperationAnomalyDetails(
  operations: STSOperation[],
  minGapHours = 5
): AnomalyExplanation[] {
  const explanations: AnomalyExplanation[] = []

  findShortGapPairs(operations, (o) => o.barge_id, opTimestamp, vesselIdentityKey, minGapHours).forEach((p) => {
    const opA = operations[p.a]
    const opB = operations[p.b]
    const gapMinutes = Math.round(p.gapMs / 60000)
    explanations.push({
      indices: [p.a, p.b],
      reasonType: "same_barge_different_vessel",
      gapMinutes,
      gapLabel: formatGap(gapMinutes),
      summary: `${opA.barge_name} supplied ${opA.receiving_vessel_name} then ${opB.receiving_vessel_name}, ${formatGap(gapMinutes)} apart — too fast for one barge to switch vessels.`,
    })
  })

  findShortGapPairs(operations, vesselIdentityKey, opTimestamp, (o) => o.barge_id, minGapHours).forEach((p) => {
    const opA = operations[p.a]
    const opB = operations[p.b]
    const gapMinutes = Math.round(p.gapMs / 60000)
    explanations.push({
      indices: [p.a, p.b],
      reasonType: "same_vessel_different_barge",
      gapMinutes,
      gapLabel: formatGap(gapMinutes),
      summary: `${opA.receiving_vessel_name} bunkered by ${opA.barge_name} then ${opB.barge_name}, ${formatGap(gapMinutes)} apart — too fast for two different barges.`,
    })
  })

  return explanations.sort((a, b) => a.indices[0] - b.indices[0])
}

/**
 * Convenience wrapper for callers that only need "is this row flagged" —
 * the Barges table badge, Vessels page row highlighting, and the
 * Dashboard KPI count. Derived from findOperationAnomalyDetails() so the
 * count-only view and the explained view can never drift apart.
 */
export function findOperationAnomalies(
  operations: STSOperation[],
  minGapHours = 5
): Set<number> {
  const flagged = new Set<number>()
  findOperationAnomalyDetails(operations, minGapHours).forEach((d) => {
    flagged.add(d.indices[0])
    flagged.add(d.indices[1])
  })
  return flagged
}
