import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

// GET /api/admin/dashboard?period=30
//
// Returns a single JSON blob containing all dashboard metrics. All the heavy
// aggregation happens inside the `get_dashboard_metrics` Postgres RPC — the
// client receives ~5KB instead of pulling the full reservations list. This is
// the main defense against blowing through the Supabase free-tier bandwidth cap.
//
// Admin-only. Hostess auth cannot see historical/cross-customer data.
export async function GET(request: Request) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const rawPeriod = url.searchParams.get('period')
  // Guard: clamp to sensible window. 7 days for week view, 365 for year view.
  // Anything else defaults to 30 days (monthly).
  let period = Number(rawPeriod)
  if (!Number.isFinite(period) || period < 1 || period > 3650) period = 30
  period = Math.floor(period)

  const sb = getServiceClient()
  const { data, error } = await sb.rpc('get_dashboard_metrics', { period_days: period })

  if (error) {
    // If the migration hasn't been run yet the RPC won't exist — surface a
    // clean error so the UI can tell the admin what to do instead of showing
    // a cryptic 500.
    console.error('[dashboard RPC] error:', error)
    return NextResponse.json(
      {
        error: 'לא ניתן לטעון את הדשבורד. ייתכן שחסר migration במסד הנתונים.',
        detail: error.message,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ metrics: data, period })
}
