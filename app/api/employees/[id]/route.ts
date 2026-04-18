import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

const ROLES = ['bartender', 'waiter', 'host', 'kitchen', 'dishwasher', 'manager'] as const
const GENDERS = ['male', 'female', 'other'] as const

const updateSchema = z
  .object({
    full_name: z.string().min(2).optional(),
    role: z.enum(ROLES).optional(),
    // If provided, replaces the full list of secondary roles.
    secondary_roles: z.array(z.enum(ROLES)).optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    gender: z.enum(GENDERS).optional(),
    hourly_rate: z.number().min(0).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    d =>
      !d.role ||
      !d.secondary_roles ||
      !d.secondary_roles.includes(d.role),
    {
      message: 'התפקיד הראשי לא יכול להופיע גם כתפקיד משני',
      path: ['secondary_roles'],
    }
  )
  .refine(
    d =>
      !d.secondary_roles ||
      new Set(d.secondary_roles).size === d.secondary_roles.length,
    { message: 'תפקיד משני כפול', path: ['secondary_roles'] }
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
