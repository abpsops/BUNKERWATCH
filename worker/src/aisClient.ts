import WebSocket from "ws"
import type { VesselFix } from "./detection.js"

const FUJAIRAH_BBOX: [[number, number], [number, number]] = [
  [24.8, 56.0],
  [25.7, 57.2],
]

type FixListener = (fix: VesselFix) => void

/**
 * Same AISStream.io feed as the browser Live Map client, but running in
 * Node with automatic reconnection — this has to stay connected 24/7,
 * unlike the browser client which only needs to work while a tab is open.
 */
export class AisStreamWorkerClient {
  private ws: WebSocket | null = null
  private mmsiToStatic = new Map<
    number,
    { imo: string | null; name: string | null; shipType: number | null; destination: string | null }
  >()
  private listeners = new Set<FixListener>()
  private reconnectDelayMs = 2000
  private shouldRun = true

  constructor(private apiKey: string) {}

  onFix(fn: FixListener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getStatic(mmsi: number) {
    return this.mmsiToStatic.get(mmsi) ?? null
  }

  start() {
    this.shouldRun = true
    this.connect()
  }

  stop() {
    this.shouldRun = false
    this.ws?.close()
  }

  private connect() {
    console.log("[ais] connecting…")
    this.ws = new WebSocket("wss://stream.aisstream.io/v0/stream")

    this.ws.on("open", () => {
      console.log("[ais] connected")
      this.reconnectDelayMs = 2000
      this.ws?.send(
        JSON.stringify({
          APIKey: this.apiKey,
          BoundingBoxes: [FUJAIRAH_BBOX],
          FilterMessageTypes: ["PositionReport", "ShipStaticData"],
        })
      )
    })

    this.ws.on("message", (data) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        console.log("[ais] non-JSON message:", data.toString().slice(0, 200))
        return
      }
      if (msg.MessageType !== "PositionReport" && msg.MessageType !== "ShipStaticData") {
        // Surfaces auth errors, rate-limit notices, or anything else
        // AISStream sends that isn't a position/static message.
        console.log("[ais] unhandled message:", JSON.stringify(msg).slice(0, 300))
      }
      this.handleMessage(msg)
    })

    this.ws.on("error", (err) => console.error("[ais] error", err.message))

    this.ws.on("close", (code, reason) => {
      console.log(`[ais] closed (code ${code}${reason?.length ? `, reason: ${reason}` : ""})`)
      if (this.shouldRun) {
        setTimeout(() => this.connect(), this.reconnectDelayMs)
        this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 60_000)
      }
    })
  }

  private handleMessage(msg: any) {
    const mmsi = msg?.MetaData?.MMSI
    if (!mmsi) return

    if (msg.MessageType === "ShipStaticData") {
      const data = msg.Message?.ShipStaticData
      const imoRaw = data?.ImoNumber
      this.mmsiToStatic.set(mmsi, {
        imo: imoRaw && imoRaw > 0 ? String(imoRaw) : null,
        name: msg.MetaData?.ShipName?.trim() || data?.Name?.trim() || null,
        shipType: typeof data?.Type === "number" && data.Type > 0 ? data.Type : null,
        destination: data?.Destination?.trim() || null,
      })
      return
    }

    if (msg.MessageType === "PositionReport") {
      const pos = msg.Message?.PositionReport
      if (!pos) return
      const known = this.mmsiToStatic.get(mmsi)
      const fix: VesselFix = {
        mmsi,
        imo: known?.imo ?? null,
        name: known?.name ?? msg.MetaData?.ShipName?.trim() ?? null,
        latitude: msg.MetaData?.latitude ?? pos.Latitude,
        longitude: msg.MetaData?.longitude ?? pos.Longitude,
        speedKnots: pos.Sog ?? null,
        timestamp: Date.now(),
        courseDeg: typeof pos.Cog === "number" && pos.Cog < 360 ? pos.Cog : null,
        headingDeg: typeof pos.TrueHeading === "number" && pos.TrueHeading < 360 ? pos.TrueHeading : null,
        navStatus: typeof pos.NavigationalStatus === "number" ? pos.NavigationalStatus : null,
        shipType: known?.shipType ?? null,
        destination: known?.destination ?? null,
      }
      this.listeners.forEach((fn) => fn(fix))
    }
  }
}
