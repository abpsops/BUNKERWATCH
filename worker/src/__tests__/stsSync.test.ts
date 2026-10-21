import { describe, it, expect } from "vitest"
import { fetchStsEvents, classify, zoneLabel, ShipFinderStsSync, type StsEvent } from "../stsSync.js"

const apiBody = {
  status: 0, msg: "",
  data: {
    ship_data: { mmsi: 470123456 },
    approach_data: [
      { approach_event: { approach_time: 1760000000, separation_time: 1760009000, duration: 150, approach_zone: 2, lat: 25.2, lng: 56.5, port_code: "AEFJR", sog: 0.3 },
        approach_ship: { mmsi: 477111000, imo: 9700001, call_sign: "X", ship_name: "BIG TANKER", ship_type: 80 } },
      { approach_event: { approach_time: 1760020000, separation_time: 1760020300, duration: 5, approach_zone: 2, lat: 25.2, lng: 56.5, port_code: "", sog: 1 },
        approach_ship: { mmsi: 470222000, imo: 0, call_sign: "", ship_name: "FUJ TUG 1", ship_type: 52 } },
    ],
  },
}
const okFetch = (body: unknown) => (async () => ({ ok: true, text: async () => JSON.stringify(body) })) as unknown as typeof fetch

describe("sts sync", () => {
  it("parses events and classifies them", async () => {
    const evs = await fetchStsEvents("k", 470123456, 1759500000000, 1760100000000, 2, okFetch(apiBody))
    expect(evs).toHaveLength(2)
    expect(evs[0].otherImo).toBe("9700001")
    expect(evs[0].durationMin).toBe(150)
    expect(zoneLabel(evs[0])).toBe("Anchorage AEFJR")
    expect(classify(evs[0], () => false)).toEqual({ type: "STS_BUNKERING", confidence: "high" })
    expect(classify(evs[1], () => false).type).toBe("OTHER_STS") // tug
    expect(classify(evs[0], () => true).type).toBe("OTHER_STS") // barge-to-barge
  })

  it("treats status 3 as no events and rejects windows over 7 days", async () => {
    expect(await fetchStsEvents("k", 1, 0, 1000, 2, okFetch({ status: 3, msg: "none" }))).toEqual([])
    await expect(fetchStsEvents("k", 1, 0, 8 * 86400 * 1000, 2, okFetch(apiBody))).rejects.toThrow("7 days")
  })

  it("stops the cycle on a quota error", async () => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return { ok: true, text: async () => JSON.stringify({ status: 38, msg: "The number of queries exceeded" }) } }) as unknown as typeof fetch
    const written: StsEvent[] = []
    const sync = new ShipFinderStsSync("k", 1000, [2, 1], {
      getFleet: () => [{ id: "a", name: "A", imo: "1111111", mmsi: "470000001" }, { id: "b", name: "B", imo: "2222222", mmsi: "470000002" }],
      isTrackedBarge: () => false,
      write: async (_b, ev) => { written.push(ev) },
    }, fetchImpl)
    const r = await sync.runOnce()
    expect(r.quotaHit).toBe(true)
    expect(calls).toBe(1)
    expect(written).toHaveLength(0)
  })
})
