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
  // Extra particulars (ShipFinder feed); null on AISStream rows.
  call_sign?: string | null
  length_m?: number | null
  width_m?: number | null
  draught_m?: number | null
  eta?: string | null
  dest_code?: string | null
  source?: string
}

export type LiveStatus = "demo" | "connecting" | "live" | "reconnecting"

/** Drop vessels not heard from in this long — they've left the box or gone dark. */
const STALE_MS = 2 * 60 * 60 * 1000
/** Poll interval. Plain selects don't count against Supabase's Realtime quota, so this is free. */
const POLL_MS = 10_000

/**
 * Polls `vessel_positions` every 10 s (only rows changed since the last
 * poll, after the first full snapshot) and patches the in-memory map. Every
 * vessel in the Fujairah bounding box is kept — the page decides what to
 * emphasise. Polling pauses while the tab is hidden.
 */
export function useLivePositions() {
  const [positions, setPositions] = useState<Map<number, LivePosition>>(() => new Map())
  const [status, setStatus] = useState<LiveStatus>(supabase ? "connecting" : "demo")
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const lastSeenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false
    let failures = 0

    const normalise = (row: LivePosition): LivePosition => ({
      ...row,
      mmsi: Number(row.mmsi),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    })

    const poll = async () => {
      if (document.hidden) return
      const since = lastSeenRef.current ?? new Date(Date.now() - STALE_MS).toISOString()
      const { data, error } = await client
        .from("vessel_positions")
        .select("*")
        .gte("updated_at", since)
        .order("updated_at", { ascending: true })
      if (cancelled) return
      if (error) {
        failures++
        if (failures >= 3) setStatus("reconnecting")
        return
      }
      failures = 0
      const rows = (data ?? []) as (LivePosition & { updated_at: string })[]
      if (rows.length > 0) {
        lastSeenRef.current = rows[rows.length - 1].updated_at
        setPositions((prev) => {
          const next = new Map(prev)
          for (const r of rows) next.set(Number(r.mmsi), normalise(r))
          return next
        })
        setLastEventAt(Date.now())
      }
      setStatus("live")
    }

    void poll()
    const timer = setInterval(poll, POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void poll()
    }
    document.addEventListener("visibilitychange", onVisible)

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
      cancelled = true
      clearInterval(timer)
      clearInterval(sweep)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return { positions, status, lastEventAt }
}
