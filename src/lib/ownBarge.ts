import { normalizeVesselName } from "@/lib/anomalies"

/**
 * A barge IS a vessel — so the "vessel" being supplied in an operation
 * can actually be one of the SAME competitor's own other barges, not a
 * genuine third-party client. This builds a lookup of "own barge name"
 * keys per competitor, scoped by competitor so a different competitor
 * happening to name a barge the same thing doesn't get flagged.
 *
 * Matching is by NAME only, deliberately bypassing vesselIdentityKey's
 * usual IMO-takes-precedence behavior. The AIS-narrative import path
 * never supplies a vessel IMO, but the generic CSV import path can (if
 * the sheet has a "Receiving IMO" column) — and when it does, that IMO
 * belongs to the receiving vessel's own real-world registry entry, which
 * will never equal the barge's own separate real IMO even when the two
 * happen to share a name. Comparing by name only is what actually
 * answers "is this the same named asset", regardless of which import
 * path produced the record or what IMO (if any) it happened to carry.
 */
export function buildOwnBargeIndex(
  barges: { competitor_id: string; name: string }[]
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  barges.forEach((b) => {
    const key = normalizeVesselName(b.name)
    if (!index.has(b.competitor_id)) index.set(b.competitor_id, new Set())
    index.get(b.competitor_id)!.add(key)
  })
  return index
}

/** True if this operation's supplied vessel is one of the SAME competitor's own barges. */
export function isOwnBargeSupply(
  op: { competitor_id: string; receiving_vessel_name: string },
  ownBargeIndex: Map<string, Set<string>>
): boolean {
  return ownBargeIndex.get(op.competitor_id)?.has(normalizeVesselName(op.receiving_vessel_name)) ?? false
}
