import { vesselIdentityKey } from "@/lib/anomalies"

/**
 * A barge IS a vessel — so the "vessel" being supplied in an operation
 * can actually be one of the SAME competitor's own other barges, not a
 * genuine third-party client. This builds a lookup of "own barge name"
 * keys per competitor, scoped by competitor so a different competitor
 * happening to name a barge the same thing doesn't get flagged.
 *
 * Matching is name-only by design: real operations never carry a vessel
 * IMO (see vesselIdentityKey's own comment), so comparing against a
 * barge's actual IMO would never line up with an operation's key.
 */
export function buildOwnBargeIndex(
  barges: { competitor_id: string; name: string }[]
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  barges.forEach((b) => {
    const key = vesselIdentityKey({ receiving_vessel_imo: "", receiving_vessel_name: b.name })
    if (!index.has(b.competitor_id)) index.set(b.competitor_id, new Set())
    index.get(b.competitor_id)!.add(key)
  })
  return index
}

/** True if this operation's supplied vessel is one of the SAME competitor's own barges. */
export function isOwnBargeSupply(
  op: { competitor_id: string; receiving_vessel_imo: string; receiving_vessel_name: string },
  ownBargeIndex: Map<string, Set<string>>
): boolean {
  return ownBargeIndex.get(op.competitor_id)?.has(vesselIdentityKey(op)) ?? false
}
