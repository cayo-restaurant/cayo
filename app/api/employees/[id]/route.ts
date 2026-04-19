import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

const ROLES = ['bartender', 'waiter', 'host', 'kitchen', 'dishwasher', 'manager'] as const
const GENDERS = ['male', 'female', 'other'] as const

const updateSchema = z
  .object({
    full_name: z.string().min(2).optional(),
    // Replaces the full list of roles when provided. Must have >=1 entry.
    roles: z.array(z.enum(ROLES)).min(1).optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    gender: z.enum(GENDERS).optional(),
    hourly_rate: z.number().min(0).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    d => !d.roles || new Set(d.roles).size === d.roles.length,
    { message: 'תפקיד כפול', path: ['roles'] }
  )

type Params = { params: Promise<{ id: string }> }

// PUT /api/employees/:id — update employee
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
    .from('employees')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE /api/employees/:id — delete employee
export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const sb = getServiceClient()
  const { error } = await sb.from('employees').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
