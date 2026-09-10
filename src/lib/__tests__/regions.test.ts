import { describe, it, expect } from "vitest"
import { regionForLocation, regionForBargeOperations, REGION_ORDER } from "@/lib/regions"

describe("regionForLocation", () => {
  it("classifies Fujairah", () => {
    expect(regionForLocation("Fujairah")).toBe("FUJ")
    expect(regionForLocation("FUJ")).toBe("FUJ")
  })

  it("classifies Khor Fakkan", () => {
    expect(regionForLocation("Khor Fakkan")).toBe("KFK")
  })

  it("classifies every named Omani port", () => {
    expect(regionForLocation("Sohar")).toBe("OMAN")
    expect(regionForLocation("Salalah")).toBe("OMAN")
    expect(regionForLocation("Shinas")).toBe("OMAN")
    expect(regionForLocation("Al Duqm")).toBe("OMAN")
    expect(regionForLocation("Duqm")).toBe("OMAN")
  })

  it("is case-insensitive", () => {
    expect(regionForLocation("fujairah")).toBe("FUJ")
    expect(regionForLocation("SOHAR")).toBe("OMAN")
  })

  it("falls back to UNASSIGNED for null, empty, or unrecognized locations", () => {
    expect(regionForLocation(null)).toBe("UNASSIGNED")
    expect(regionForLocation(undefined)).toBe("UNASSIGNED")
    expect(regionForLocation("")).toBe("UNASSIGNED")
    expect(regionForLocation("Port Rashid")).toBe("UNASSIGNED")
  })
})

describe("regionForBargeOperations", () => {
  it("returns UNASSIGNED for a barge with no operations yet", () => {
    expect(regionForBargeOperations([])).toBe("UNASSIGNED")
  })

  it("returns the single region when all operations agree", () => {
    const ops = [{ location: "Fujairah" }, { location: "Fujairah" }, { location: "Fujairah" }]
    expect(regionForBargeOperations(ops)).toBe("FUJ")
  })

  it("returns the most frequent region when operations span more than one", () => {
    const ops = [{ location: "Fujairah" }, { location: "Sohar" }, { location: "Sohar" }, { location: "Sohar" }]
    expect(regionForBargeOperations(ops)).toBe("OMAN")
  })

  it("prefers a real region over UNASSIGNED when tied", () => {
    const ops = [{ location: "Fujairah" }, { location: null }]
    expect(regionForBargeOperations(ops)).toBe("FUJ")
  })
})

describe("REGION_ORDER", () => {
  it("is exactly FUJ, then KFK, then OMAN, then UNASSIGNED", () => {
    expect(REGION_ORDER).toEqual(["FUJ", "KFK", "OMAN", "UNASSIGNED"])
  })
})
