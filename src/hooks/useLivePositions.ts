import { useEffect, useRef, useState } from "react"
import { supabase } from "@/services/supabase/client"

export interface LivePosition {
  mmsi: number
  imo: string | null
  name: string | null
  ship_type: number | null
  destination: string | null
  latitude: number
  longitude: number
  speed_knots: number | null
  course_deg: number | null
  heading_deg: number | null
  nav_status: number | null
  received_at: string
}

export type LiveStatus = "demo" | "connecting" | "live" | "reconnecting"

/** Drop vessels not heard from in this long — they've left the box or gone dark. */
const STALE_MS = 2 * 60 * 60 * 1000

/**
 * Initial snapshot of `vessel_positions` followed by a Realtime subscription
 * that patches rows in place as the worker upserts them. Every vessel in the
 * Fujairah bounding box is kept — the page decides what to emphasise.
 */
export function useLivePositions() {
  const [positions, setPositions] = useState<Map<number, LivePosition>>(() => new Map())
  const [status, setStatus] = useState<LiveStatus>(supabase ? "connecting" : "demo")
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!supabase) return
    const client = supabase

    const applyRow = (row: LivePosition) => {
      if (!mountedRef.current) return
      setPositions((prev) => {
        const next = new Map(prev)
        next.set(Number(row.mmsi), { ...row, mmsi: Number(row.mmsi), latitude: Number(row.latitude), longitude: Number(row.longitude) })
        return next
      })
      setLastEventAt(Date.now())
    }

    const loadSnapshot = async () => {
      const since = new Date(Date.now() - STALE_MS).toISOString()
      const { data, error } = await client
        .from("vessel_positions")
        .select("*")
        .gte("received_at", since)
      if (error || !mountedRef.current) return
      const next = new Map<number, LivePosition>()
      for (const row of (data ?? []) as LivePosition[]) {
        next.set(Number(row.mmsi), { ...row, mmsi: Number(row.mmsi), latitude: Number(row.latitude), longitude: Number(row.longitude) })
      }
      setPositions(next)
      setLastEventAt(Date.now())
    }

    void loadSnapshot()

    const channel = client
      .channel("vessel_positions_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vessel_positions" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const mmsi = Number((payload.old as { mmsi?: number }).mmsi)
            setPositions((prev) => {
              const next = new Map(prev)
              next.delete(mmsi)
              return next
            })
            return
          }
          applyRow(payload.new as LivePosition)
        }
      )
      .subscribe((state) => {
        if (!mountedRef.current) return
        if (state === "SUBSCRIBED") {
          setStatus("live")
          void loadSnapshot() // catch anything missed while (re)connecting
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          setStatus("reconnecting")
        }
      })

    // Periodically sweep vessels that have gone silent.
    const sweep = setInterval(() => {
      const cutoff = Date.now() - STALE_MS
      setPositions((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [mmsi, p] of prev) {
          if (new Date(p.received_at).getTime() < cutoff) {
            next.delete(mmsi)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 60_000)

    return () => {
      mountedRef.current = false
      clearInterval(sweep)
      void client.removeChannel(channel)
    }
  }, [])

  return { positions, status, lastEventAt }
}
