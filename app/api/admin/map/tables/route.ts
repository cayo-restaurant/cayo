import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

const SHAPES = ['square', 'rectangle', 'bar_stool'] as const
const AREAS = ['bar', 'table'] as const

const createSchema = z
  .object({
    table_number: z.number().int().min(1),
    label: z.string().optional(),
    shape: z.enum(SHAPES),
    width: z.number().int().min(20).max(500).default(80),
    height: z.number().int().min(20).max(500).default(80),
    pos_x: z.number().int().min(0).default(0),
    pos_y: z.number().int().min(0).default(0),
    capacity_min: z.number().int().min(1).default(1),
    capacity_max: z.number().int().min(1).max(20).default(2),
    area: z.enum(AREAS).default('table'),
    rotation: z
      .number()
      .int()
      .refine((v) => [0, 90, 180, 270].includes(v), 'rotation חייב להיות 0/90/180/270')
      .default(0),
  })
  .refine((v) => v.capacity_max >= v.capacity_min, {
    message: 'capacity_max חייב להיות ≥ capacity_min',
    path: ['capacity_max'],
  })

export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const includeInactive =
    req.nextUrl.searchParams.get('includeInactive') === 'true'

  const sb = getServiceClient()
  let query = sb
    .from('restaurant_tables')
    .select('*')
    .order('table_number')

  if (!includeInactive) {
    query = query.eq('active', true)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('restaurant_tables')
    .insert(parsed.data)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'מספר שולחן ' + parsed.data.table_number + ' כבר קיים' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
