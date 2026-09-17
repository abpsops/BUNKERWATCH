import { describe, it, expect } from "vitest"
import { buildOwnBargeIndex, isOwnBargeSupply } from "@/lib/ownBarge"

describe("buildOwnBargeIndex / isOwnBargeSupply", () => {
  const barges = [
    { competitor_id: "omti", name: "Amal" },
    { competitor_id: "omti", name: "Zuma" },
    { competitor_id: "akron", name: "Falda" },
  ]

  it("flags a supply where the vessel name matches one of the SAME competitor's own barges", () => {
    const index = buildOwnBargeIndex(barges)
    const op = { competitor_id: "omti", receiving_vessel_name: "Zuma" }
    expect(isOwnBargeSupply(op, index)).toBe(true)
  })

  it("does NOT flag when the matching barge name belongs to a DIFFERENT competitor", () => {
    const index = buildOwnBargeIndex(barges)
    // "Falda" is Akron's own barge, not OMTI's — OMTI supplying a vessel
    // called "Falda" would be a coincidence, not OMTI's own asset.
    const op = { competitor_id: "omti", receiving_vessel_name: "Falda" }
    expect(isOwnBargeSupply(op, index)).toBe(false)
  })

  it("does not flag a genuine third-party vessel", () => {
    const index = buildOwnBargeIndex(barges)
    const op = { competitor_id: "omti", receiving_vessel_name: "OCTA DIVINE" }
    expect(isOwnBargeSupply(op, index)).toBe(false)
  })

  it("matches regardless of case or extra whitespace", () => {
    const index = buildOwnBargeIndex(barges)
    const op = { competitor_id: "omti", receiving_vessel_name: "  zuma  " }
    expect(isOwnBargeSupply(op, index)).toBe(true)
  })

  it("returns false for a competitor with no barges in the index at all", () => {
    const index = buildOwnBargeIndex(barges)
    const op = { competitor_id: "unknown-competitor", receiving_vessel_name: "Zuma" }
    expect(isOwnBargeSupply(op, index)).toBe(false)
  })

  it("REGRESSION: matches even when the operation's vessel name has a parenthetical IMO baked in from AIS narrative text ('AMAL(9239953)' vs stored barge name 'Amal')", () => {
    const index = buildOwnBargeIndex(barges)
    const op = { competitor_id: "omti", receiving_vessel_name: "AMAL(9239953)" }
    expect(isOwnBargeSupply(op, index)).toBe(true)
  })

  it("REGRESSION: still matches by name even when the caller also has a receiving_vessel_imo field set (generic CSV import path can populate a real one)", () => {
    // Real-world bug: "Zuma" supplied a vessel named "AMAL" (OMTI's own
    // barge). The generic CSV import path can attach a real, unrelated
    // vessel IMO to that row (from a "Receiving IMO" column), which is
    // NOT the barge Amal's own IMO. Own-barge matching must go by name
    // alone and ignore any such field entirely, not fall through to an
    // IMO-preferring identity key the way vesselIdentityKey does.
    const index = buildOwnBargeIndex(barges)
    const op = { competitor_id: "omti", receiving_vessel_name: "AMAL", receiving_vessel_imo: "9999999" }
    expect(isOwnBargeSupply(op, index)).toBe(true)
  })
})
