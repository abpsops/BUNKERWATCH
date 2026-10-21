import { describe, it, expect } from "vitest"
import { fetchZone, regionParam, toFix, FUJAIRAH_ZONE } from "../shipfinderClient.js"

const rec = (over: Partial<Record<string, unknown>> = {}) => ({
  mmsi: 370286000, imo: 9844100, call_sign: "HOLO", ship_name: "SEA VICTORIA ", ship_cnname: "",
  data_source: 0, ship_type: 70, length: 340, width: 62, left: 36, trail: 51, draught: 12.7,
  dest: "SINGAPORE,SG", destcode: "SGSIN", eta: "1746547200", navistat: 0, lat: 34.606657,
  lng: 121.966072, sog: 12.8, cog: 111.4, hdg: 114, rot: 0, last_time: 1745904185, ...over,
})

describe("shipfinder client", () => {
  it("formats the region as lng,lat pairs joined by dashes", () => {
    expect(regionParam(FUJAIRAH_ZONE)).toBe("56,24.8-57.2,24.8-57.2,25.7-56,25.7")
  })

  it("maps a record to a VesselFix with extras", () => {
    const f = toFix(rec() as never)
    expect(f.mmsi).toBe(370286000)
    expect(f.imo).toBe("9844100")
    expect(f.name).toBe("SEA VICTORIA")
    expect(f.timestamp).toBe(1745904185000)
    expect(f.headingDeg).toBe(114)
    expect(f.source).toBe("shipfinder")
    expect(f.extras?.draughtM).toBe(12.7)
    expect(f.extras?.eta).toBe("2025-05-06T16:00:00.000Z")
  })

  it("treats imo 0 and heading 511 as unknown", () => {
    const f = toFix(rec({ imo: 0, hdg: 511, eta: "" }) as never)
    expect(f.imo).toBeNull()
    expect(f.headingDeg).toBeNull()
    expect(f.extras?.eta).toBeNull()
  })

  it("follows scode pagination and surfaces API errors", async () => {
    const pages = [
      { status: 0, msg: "", data: { total: 3, scode: 20, continue: 1, ship_list: [rec(), rec({ mmsi: 2 })] } },
      { status: 0, msg: "", data: { total: 3, scode: 40, continue: 0, ship_list: [rec({ mmsi: 3 })] } },
    ]
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return { ok: true, text: async () => JSON.stringify(pages[calls.length - 1]) }
    }) as unknown as typeof fetch
    const fixes = await fetchZone("k", FUJAIRAH_ZONE, fetchImpl)
    expect(fixes.map((f) => f.mmsi)).toEqual([370286000, 2, 3])
    expect(calls[0]).not.toContain("scode=")
    expect(calls[1]).toContain("scode=20")

    const bad = (async () => ({ ok: true, text: async () => JSON.stringify({ status: 14, msg: "domain error" }) })) as unknown as typeof fetch
    await expect(fetchZone("k", FUJAIRAH_ZONE, bad)).rejects.toThrow("status 14")
  })
})

import { resolveMmsiByImo, fetchMulti } from "../shipfinderClient.js"

describe("shipfinder fleet mode", () => {
  it("resolves an IMO to its most recently reported MMSI", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          status: 0, msg: "", total: 3,
          data: [
            { match_type: 5, mmsi: 356688000, imo: 9738777, call_sign: "", ship_name: "A", data_source: 0, last_time: 100 },
            { match_type: 5, mmsi: 346559616, imo: 9738777, call_sign: "", ship_name: "A", data_source: 0, last_time: 900 },
            { match_type: 1, mmsi: 525007112, imo: 0, call_sign: "", ship_name: "A", data_source: 0, last_time: 999 },
          ],
        }),
    })) as unknown as typeof fetch
    expect(await resolveMmsiByImo("k", "9738777", fetchImpl)).toBe(346559616)
  })

  it("returns null when no MMSI matches the IMO", async () => {
    const fetchImpl = (async () => ({ ok: true, text: async () => JSON.stringify({ status: 0, msg: "", total: 0, data: [] }) })) as unknown as typeof fetch
    expect(await resolveMmsiByImo("k", "1234567", fetchImpl)).toBeNull()
  })

  it("chunks multi-position requests at 100 MMSIs and drops 0,0 fixes", async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return { ok: true, text: async () => JSON.stringify({ status: 0, msg: "", data: [rec({ mmsi: 1 }), rec({ mmsi: 2, lat: 0, lng: 0 })] }) }
    }) as unknown as typeof fetch
    const mmsis = Array.from({ length: 150 }, (_, i) => 100000000 + i)
    const fixes = await fetchMulti("k", mmsis, fetchImpl)
    expect(calls.length).toBe(2)
    expect(new URL(calls[0]).searchParams.get("mmsis")!.split(",").length).toBe(100)
    expect(fixes.length).toBe(2) // one valid per chunk
  })
})
