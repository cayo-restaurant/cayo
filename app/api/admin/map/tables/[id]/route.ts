import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminRequest } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { getServiceClient } from '@/lib/supabase'
import { shiftDayLocal } from '@/lib/shift-day'

// Either an admin Google session or a valid hostess cookie can edit the
// map. Hostesses adjust tables during a shift; admins manage the layout
// between shifts. Same trust level — both are authenticated employees.
async function requireMapEditor() {
  const admin = await isAdminRequest()
  if (admin) return null
  if (isHostRequest()) return null
  return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
}

// Reservations that still occupy a table and therefore block a table delete.
// Kept in sync with OCCUPYING_STATUSES in lib/capacity.ts — inlined here to
// avoid importing a server-only capacity calc for one Set lookup.
const BLOCKING_STATUSES = ['pending', 'confirmed', 'arrived'] as const

type Blocker = {
  id: string
  name: string
  time: string
  date: string
  status: string
}

async function findBlockers(tableId: string): Promise<Blocker[]> {
  const sb = getServiceClient()
  const today = shiftDayLocal()
  // Two-step fetch: junction rows by table, then matching reservations.
  // Avoids Supabase's implicit relation-shape quirks and keeps the types
  // plain. Both queries are small (one table, one dinner's reservations).
  const { data: junction, error: jErr } = await sb
    .from('reservation_tables')
    .select('reservation_id')
    .eq('table_id', tableId)
  if (jErr) throw jErr
  const ids = Array.from(new Set((junction ?? []).map(j => j.reservation_id as string)))
  if (ids.length === 0) return []
  const { data: reservations, error: rErr } = await sb
    .from('reservations')
    .select('id, name, time, date, status')
    .in('id', ids)
  if (rErr) throw rErr
  const rows = (reservations ?? []) as Array<{
    id: string; name: string; time: string; date: string; status: string
  }>
  return rows
    .filter(r => (BLOCKING_STATUSES as readonly string[]).includes(r.status) && r.date >= today)
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
}

const SHAPES = ['square', 'rectangle', 'bar_stool'] as const
const AREAS = ['bar', 'table'] as const
const KINDS = ['table', 'bar_counter', 'host_stand', 'waiter_station', 'column'] as const

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
    rotation: z
      .number()
      .int()
      .refine((v) => [0, 90, 180, 270].includes(v), 'rotation חייב להיות 0/90/180/270')
      .optional(),
    kind: z.enum(KINDS).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.capacity_min === undefined ||
      v.capacity_max === undefined ||
      v.capacity_max >= v.capacity_min,
    { message: 'capacity_max חייב להיות ≥ capacity_min', path: ['capacity_max'] },
  )

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await requireMapEditor()
  if (denied) return denied

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
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
        { error: 'מספר שולחן ' + parsed.data.table_number + ' כבר קיים' },
        { status: 409 },
      )
    }
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'שולחן לא נמצא' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = await requireMapEditor()
  if (denied) return denied

  const { id } = await params
  const hard = req.nextUrl.searchParams.get('hard') === 'true'
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  const sb = getServiceClient()

  // Pre-flight: any live/future reservation still assigned here blocks
  // both soft-delete (which would otherwise leave orphan assignments
  // pointing to an inactive table) and hard-delete (which the FK
  // ON DELETE RESTRICT would reject anyway — we return a nicer 409).
  let blockers: Blocker[]
  try {
    blockers = await findBlockers(id)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה בבדיקת שיוכים' },
      { status: 500 },
    )
  }

  if (dryRun) {
    return NextResponse.json({ ok: blockers.length === 0, blockers })
  }

  if (blockers.length > 0) {
    return NextResponse.json(
      { error: 'לא ניתן למחוק: שולחן משוייך ל־' + blockers.length + ' הזמנות פעילות', blockers },
      { status: 409 },
    )
  }

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
