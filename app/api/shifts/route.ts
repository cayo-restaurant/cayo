import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

const createSchema = z.object({
  employee_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  break_minutes: z.number().min(0).default(0),
  notes: z.string().max(500).optional(),
})

// GET /api/shifts?month=2026-04&employee_id=xxx
export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { searchParams } = req.nextUrl
  const month = searchParams.get('month') // e.g. "2026-04"
  const employeeId = searchParams.get('employee_id')

  const sb = getServiceClient()
  let query = sb
    .from('shifts')
    .select('*, employees(full_name, role, hourly_rate)')
    .order('date', { ascending: false })
    .order('start_time', { ascending: true })

  if (month) {
    const [year, m] = month.split('-').map(Number)
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`
    const endDate = m === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('date', startDate).lt('date', endDate)
  }

  if (employeeId) {
    query = query.eq('employee_id', employeeId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/shifts — create shift
export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('shifts')
    .insert(parsed.data)
    .select('*, employees(full_name, role, hourly_rate)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'משמרת כבר קיימת לעובד בתאריך ושעה זו' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
