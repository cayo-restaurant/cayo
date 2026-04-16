import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

const ROLE_LABELS: Record<string, string> = {
  bartender: 'ברמן',
  waiter: 'מלצר',
  host: 'מארח/ת',
  kitchen: 'מטבח',
  dishwasher: 'שוטף',
  manager: 'אחמ"ש',
}

function calcHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let totalMin = (eh * 60 + em) - (sh * 60 + sm)
  if (totalMin < 0) totalMin += 24 * 60 // overnight shift
  totalMin -= breakMin
  return Math.max(0, totalMin / 60)
}

// GET /api/shifts/export?month=2026-04 — returns CSV
export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const month = req.nextUrl.searchParams.get('month')
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

  const [year, m] = month.split('-').map(Number)
  const startDate = `${year}-${String(m).padStart(2, '0')}-01`
  const endDate = m === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(m + 1).padStart(2, '0')}-01`

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('shifts')
    .select('*, employees(full_name, role, hourly_rate)')
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date')
    .order('start_time')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // BOM for Hebrew Excel compatibility
  const BOM = '\uFEFF'
  const header = 'שם עובד,תפקיד,תאריך,התחלה,סיום,הפסקה (דקות),שעות,שכר שעתי,סה"כ שכר,הערות'
  const rows = (data || []).map((s: any) => {
    const emp = s.employees || {}
    const hours = calcHours(s.start_time, s.end_time, s.break_minutes || 0)
    const rate = emp.hourly_rate || 0
    const total = Math.round(hours * rate * 100) / 100
    return [
      emp.full_name || '',
      ROLE_LABELS[emp.role] || emp.role || '',
      s.date,
      s.start_time,
      s.end_time,
      s.break_minutes || 0,
      hours.toFixed(2),
      rate,
      total.toFixed(2),
      (s.notes || '').replace(/,/g, ' '),
    ].join(',')
  })

  const csv = BOM + header + '\n' + rows.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="shifts-${month}.csv"`,
    },
  })
}
