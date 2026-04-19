'use client'

// Thin EventSource wrapper for /api/admin/stream. The server holds the
// Supabase Realtime subscription (service-role) and fans INSERT/UPDATE/
// DELETE events out over SSE; this hook re-opens on drop with bounded
// exponential backoff so a flaky mobile network doesn't leave the
// admin view silently stale. Callers still keep their 60 s poll as a
// belt-and-suspenders fallback.

import { useEffect, useRef, useState } from 'react'

export type AdminRealtimeEvent = {
  table: 'reservations' | 'reservation_tables' | 'restaurant_tables'
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown> | null
  old: Record<string, unknown> | null
}

export interface UseAdminRealtime {
  connected: boolean
  lastEventAt: number | null
}

const BACKOFF_STEPS_MS = [1000, 2000, 5000, 10000]

export function useAdminRealtime(
  enabled: boolean,
  onEvent: (e: AdminRealtimeEvent) => void,
): UseAdminRealtime {
  const [connected, setConnected] = useState(false)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  // Keep the latest handler in a ref so we don't rewire the stream on
  // every parent re-render.
  const handlerRef = useRef(onEvent)
  useEffect(() => { handlerRef.current = onEvent }, [onEvent])

  useEffect(() => {
    if (!enabled) return
    let es: EventSource | null = null
    let cancelled = false
    let attempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const open = () => {
      if (cancelled) return
      es = new EventSource('/api/admin/stream')
      es.onopen = () => {
        attempt = 0
        setConnected(true)
      }
      es.onmessage = (m) => {
        try {
          const parsed: AdminRealtimeEvent = JSON.parse(m.data)
          setLastEventAt(Date.now())
          handlerRef.current(parsed)
        } catch { /* malformed frame — ignore */ }
      }
      es.onerror = () => {
        setConnected(false)
        es?.close()
        es = null
        if (cancelled) return
        const delay = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)]
        attempt++
        reconnectTimer = setTimeout(open, delay)
      }
    }

    open()
    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
      es = null
      setConnected(false)
    }
  }, [enabled])

  return { connected, lastEventAt }
}
