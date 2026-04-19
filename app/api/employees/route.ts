import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'

const ROLES = ['bartender', 'waiter', 'host', 'kitchen', 'dishwasher', 'manager'] as const
const GENDERS = ['male', 'female', 'other'] as const

// Employees now carry a flat list of roles they can be scheduled as —
// no "primary" concept. The role each shift fills comes from the shift
// row itself (shifts.role), not from the employee.
const createSchema = z
  .object({
    full_name: z.string().min(2, 'נא להזין שם מלא'),
    roles: z.array(z.enum(ROLES)).min(1, 'נא לבחור לפחות תפקיד אחד'),
    phone: z.string().optional().default(''),
    email: z.string().optional().default(''),
    gender: z.enum(GENDERS).optional(),
    hourly_rate: z.number().min(0).default(0),
  })
  .refine(d => new Set(d.roles).size === d.roles.length, {
    message: 'תפקיד כפול',
    path: ['roles'],
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
