import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { getServiceClient } from '@/lib/supabase'

// Read-only rota view for the staff landing page. Accepts either an admin
// session (manager/owner) or the staff cookie (any active employee). This
// deliberately parallels /api/shifts?month=YYYY-MM but strips fields that
// waiters / bartenders / kitchen staff shouldn't see about each other
// (specifically hourly_rate).
//
// The admin's /admin/hours editor continues to use /api/shifts which
// returns full details including hourly_rate for pay calculations.
export async function GET(req: NextRequest) {
  const admin = await isAdminRequest()
  const staff = !admin && isHostRequest()
  if (!admin && !staff) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const month = searchParams.get('month') // e.g. "2026-04"
  const weekStart = searchParams.get('week') // e.g. "2026-04-19" (Sunday)

  const sb = getServiceClient()
  let query = sb
    .from('shifts')
    // Intentionally do NOT select hourly_rate. We only need the name.
    .select('id, employee_id, role, date, start_time, end_time, break_minutes, notes, employees(full_name)')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    // Compute [weekStart, weekStart+7) in-memory — avoids any timezone
    // surprises from doing it in SQL.
    const [y, m, d] = weekStart.split('-').map(Number)
    const start = new Date(y, m - 1, d)
    const end = new Date(y, m - 1, d + 7)
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    query = query.gte('date', weekStart).lt('date', endStr)
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, m] = month.split('-').map(Number)
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`
    const endDate = m === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('date', startDate).lt('date', endDate)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
