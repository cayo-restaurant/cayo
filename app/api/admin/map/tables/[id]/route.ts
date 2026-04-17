import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

// Keep these in sync with /api/admin/map/tables/route.ts
const SHAPES = ['square', 'rectangle', 'bar_stool'] as const
const AREAS = ['bar', 'table'] as const

// Schema for PATCH — every field is optional. We do the cross-field capacity
// check only when both min and max are being updated together (the DB's
// CHECK constraint will still catch any partial update that breaks the
// invariant when combined with existing row values).
const updateSchema = z
  .object({
    table_number: z.number().int().min(1).optional(),
    label: z.string().nullable().optional(),
    shape: z.enum(SHAPES).optional(),
    width: z.number().int().min(20).max(500).optional(),
    height: z.number().int().min(20).max(500).optional(),
    pos_x: z.number().int().min(0).optional(),
    pos_y: z.number().int().min(0).optional(),
    capacity_min: z.number().int().min(1).optional(),
    capacity_max: z.number().int().min(1).max(20).optional(),
    area: z.enum(AREAS).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.capacity_min === undefined ||
      v.capacity_max === undefined ||
      v.capacity_max >= v.capacity_min,
    {
      message: 'capacity_max חייב להיות ≥ capacity_min',
      path: ['capacity_max'],
    },
  )

type Params = { params: Promise<{ id: string }> }

// ---------------------------------------------
// PATCH /api/admin/map/tables/:id
// Updates any subset of table fields. Also used to reactivate a soft-deleted
// table by sending { active: true }.
// ---------------------------------------------
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  // Empty body — nothing to update.
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'לא הועברו שינויים' }, { status: 400 })
  }

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('restaurant_tables')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `מספר שולחן ${parsed.data.table_number} כבר קיים` },
        { status: 409 },
      )
    }
    // PostgREST returns PGRST116 when .single() finds zero rows.
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'שולחן לא נמצא' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// ---------------------------------------------
// DELETE /api/admin/map/tables/:id
// Soft-delete: sets active=false. Hard deletes would break historical
// reservations that reference this table. Use ?hard=true to force a real
// delete (reserved for cleanup / admin ops; reservations.table_id will go
// to NULL automatically thanks to ON DELETE SET NULL).
// ---------------------------------------------
export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const hard = req.nextUrl.searchParams.get('hard') === 'true'
  const sb = getServiceClient()

  if (hard) {
    const { error } = await sb.from('restaurant_tables').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, hard: true })
  }

  const { data, error } = await sb
    .from('restaurant_tables')
    .update({ active: false })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'שולחן לא נמצא' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, table: data })
}
