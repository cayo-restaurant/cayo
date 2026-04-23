import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getHostEmployeeId } from '@/lib/host-auth'
import { getServiceClient } from '@/lib/supabase'

// Availability submissions for the upcoming week, scoped to the logged-in
// employee. Read via GET, toggled via PUT. No POST/DELETE — the admin
// UI (when it's built) will read everyone's rows via a separate admin
// endpoint.
//
// Existence = available. A PUT with available=false deletes the row
// rather than setting a boolean. This keeps "is X available for opening
// on Y" a clean existence check on the admin side.

const SHIFT_TYPES = ['opening', 'closing'] as const

const putSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין'),
  shift_type: z.enum(SHIFT_TYPES),
  available: z.boolean(),
})

// GET /api/staff/shift-requests?week=YYYY-MM-DD
// Returns [{ date, shift_type }] for the current employee, optionally
// filtered to a week window [week, week+7). When ?week is missing we
// return everything from today onward — the submit form only uses the
// week filter, but other callers might want the lookahead.
export async function GET(req: NextRequest) {
  const employeeId = getHostEmployeeId()
  if (!employeeId) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const week = searchParams.get('week')

  const sb = getServiceClient()
  let query = sb
    .from('shift_requests')
    .select('date, shift_type')
    .eq('employee_id', employeeId)
    .order('date', { ascending: true })

  if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const [y, m, d] = week.split('-').map(Number)
    const end = new Date(y, m - 1, d + 7)
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    query = query.gte('date', week).lt('date', endStr)
  } else {
    // Default: today onwards. Avoids sending back months of history.
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    query = query.gte('date', todayStr)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PUT /api/staff/shift-requests
// Body: { date, shift_type, available }
// - available=true  → upsert (date, shift_type, employee_id)
// - available=false → delete the matching row (no-op if it doesn't exist)
// Always returns { ok: true } on success; the client mirrors the state
// optimistically so no payload is needed.
export async function PUT(req: NextRequest) {
  const employeeId = getHostEmployeeId()
  if (!employeeId) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { date, shift_type, available } = parsed.data

  const sb = getServiceClient()

  if (available) {
    // Upsert on the (employee_id, date, shift_type) unique index. If the
    // row already exists this is a no-op update that bumps updated_at.
    const { error } = await sb
      .from('shift_requests')
      .upsert(
        { employee_id: employeeId, date, shift_type },
        { onConflict: 'employee_id,date,shift_type' },
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await sb
      .from('shift_requests')
      .delete()
      .eq('employee_id', employeeId)
      .eq('date', date)
      .eq('shift_type', shift_type)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
