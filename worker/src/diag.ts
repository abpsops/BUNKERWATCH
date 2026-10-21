import "dotenv/config"
import WebSocket from "ws"
if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = WebSocket
import { createClient } from "@supabase/supabase-js"

/**
 * AIS feed diagnostic. Connects to AISStream twice — once with a
 * whole-world bounding box, once with the Fujairah box — counts what
 * arrives in a fixed window, and writes the result to
 * `worker_diagnostics` so it can be read without access to CI logs.
 */
const KEY = process.env.AISSTREAM_API_KEY!
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const WINDOW_MS = Number(process.env.DIAG_WINDOW_MS ?? 60_000)

async function probe(label: string, bbox: number[][][]) {
  return new Promise<Record<string, unknown>>((resolve) => {
    const counts: Record<string, number> = {}
    const samples: unknown[] = []
    const mmsis = new Set<number>()
    let confirmed: unknown = null
    const errors: string[] = []
    const t0 = Date.now()
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream")
    ws.on("open", () => ws.send(JSON.stringify({ APIKey: KEY, BoundingBoxes: bbox, FilterMessageTypes: ["PositionReport", "ShipStaticData"] })))
    ws.on("message", (d) => {
      try {
        const m = JSON.parse(d.toString())
        const type = m.MessageType ?? m.error ?? "unknown"
        counts[type] = (counts[type] ?? 0) + 1
        if (m.MetaData?.MMSI) mmsis.add(m.MetaData.MMSI)
        if (!m.MessageType) confirmed = m
        if (samples.length < 2 && m.MessageType === "PositionReport") samples.push({ name: m.MetaData?.ShipName, lat: m.MetaData?.latitude, lon: m.MetaData?.longitude })
      } catch (e) {
        errors.push(`parse: ${String(d).slice(0, 120)}`)
      }
    })
    ws.on("error", (e) => errors.push(`ws error: ${e.message}`))
    ws.on("close", (code, reason) => errors.push(`closed ${code} ${reason?.toString() ?? ""} after ${Date.now() - t0}ms`))
    setTimeout(() => {
      try { ws.close() } catch {}
      resolve({ label, bbox, windowMs: WINDOW_MS, counts, uniqueVessels: mmsis.size, samples, firstNonDataMessage: confirmed, errors })
    }, WINDOW_MS)
  })
}

async function main() {
  const results = []
  results.push(await probe("world", [[[-90, -180], [90, 180]]]))
  results.push(await probe("fujairah", [[[24.8, 56.0], [25.7, 57.2]]]))
  results.push(await probe("gulf_wide", [[[22.0, 50.0], [27.5, 60.0]]]))
  console.log(JSON.stringify(results, null, 2))
  const { error } = await supabase.from("worker_diagnostics").insert({ kind: "aisstream_probe", payload: { keyPresent: Boolean(KEY), keyLength: KEY?.length ?? 0, results } })
  if (error) console.error("write failed:", error.message)
  process.exit(0)
}
main()
