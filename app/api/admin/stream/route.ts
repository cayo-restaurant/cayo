// Server-Sent Events fan-out for admin real-time updates.
//
// Why SSE over Supabase Realtime directly from the browser? RLS on the
// reservations / reservation_tables / restaurant_tables families is
// deny-all today (only the service role bypasses). Opening a Realtime
// channel from the client would silently deliver zero events. Rather
// than widen RLS just to power a dashboard feature, the server keeps
// the service-role subscription and fans events out to authenticated
// admin browsers over a standard SSE connection — NextAuth cookie gates
// it, no new public surface.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WatchedTable = 'reservations' | 'reservation_tables' | 'restaurant_tables'
const WATCHED: WatchedTable[] = ['reservations', 'reservation_tables', 'restaurant_tables']

export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const sb = getServiceClient()

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const safeEnqueue = (s: string) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(s)) } catch { /* consumer gone */ }
      }

      // Initial hello so the client can flip `connected` true immediately,
      // even on networks that buffer the first byte for a while.
      safeEnqueue(': connected\n\n')

      const channel = sb.channel('admin-stream-' + Math.random().toString(36).slice(2, 8))
      for (const table of WATCHED) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            safeEnqueue(
              'data: ' + JSON.stringify({
                table,
                type: payload.eventType,
                new: (payload.new as Record<string, unknown>) ?? null,
                old: (payload.old as Record<string, unknown>) ?? null,
              }) + '\n\n',
            )
          },
        )
      }
      channel.subscribe()

      // Heartbeat — SSE comments prevent idle-timeout proxies from closing
      // the connection and keep the browser's `EventSource.readyState` open.
      const heartbeat = setInterval(() => safeEnqueue(': ping\n\n'), 20000)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        try { sb.removeChannel(channel) } catch { /* ignore */ }
        try { controller.close() } catch { /* already closed */ }
      }

      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
