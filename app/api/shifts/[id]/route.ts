import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

const updateSchema = z.object({
  employee_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  break_minutes: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
})

type Params = { params: Promise<{ id: string }> }

// PUT /api/shifts/:id
export async function PUT(req: NextRequest, { params }: Params) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('shifts')
    .update(parsed.data)
    .eq('id', id)
    .select('*, employees(full_name, hourly_rate)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'משמרת לא נמצאה' }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE /api/shifts/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const sb = getServiceClient()
  const { error } = await sb.from('shifts').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
