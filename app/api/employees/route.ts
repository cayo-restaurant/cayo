import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

const ROLES = ['bartender', 'waiter', 'host', 'kitchen', 'dishwasher', 'manager'] as const
const GENDERS = ['male', 'female', 'other'] as const

const createSchema = z
  .object({
    full_name: z.string().min(2, 'נא להזין שם מלא'),
    role: z.enum(ROLES),
    // Additional roles the employee can fill in as (e.g. a bartender who also
    // works waiter shifts). Primary `role` drives display/color/grouping;
    // secondary_roles only expand eligibility in the /admin/hours slot picker.
    secondary_roles: z.array(z.enum(ROLES)).default([]),
    phone: z.string().optional().default(''),
    email: z.string().optional().default(''),
    gender: z.enum(GENDERS).optional(),
    hourly_rate: z.number().min(0).default(0),
  })
  .refine(d => !d.secondary_roles.includes(d.role), {
    message: 'התפקיד הראשי לא יכול להופיע גם כתפקיד משני',
    path: ['secondary_roles'],
  })
  .refine(d => new Set(d.secondary_roles).size === d.secondary_roles.length, {
    message: 'תפקיד משני כפול',
    path: ['secondary_roles'],
  })

// GET /api/employees — list all employees
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('employees')
    .select('*')
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/employees — create employee
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
    .from('employees')
    .insert(parsed.data)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
