import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { getServiceClient } from '@/lib/supabase'
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/password'

const ROLES = ['bartender', 'waiter', 'host', 'kitchen', 'dishwasher', 'manager'] as const
const GENDERS = ['male', 'female', 'other'] as const

// A shared schema fragment for the optional password input. Admin sets it
// directly from the employees form; we hash before writing to the DB and
// never send the hash back down the wire.
const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `סיסמה חייבת להיות לפחות ${MIN_PASSWORD_LENGTH} תווים`)
  .optional()

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
    password: passwordField,
  })
  .refine(d => new Set(d.roles).size === d.roles.length, {
    message: 'תפקיד כפול',
    path: ['roles'],
  })

// Strip internal-only auth fields so the UI never sees the bcrypt hash.
function sanitize<T extends Record<string, unknown>>(row: T): Omit<T, 'password_hash'> {
  if (!row) return row as Omit<T, 'password_hash'>
  const { password_hash: _omit, ...rest } = row as Record<string, unknown>
  return rest as Omit<T, 'password_hash'>
}

// GET /api/employees — list all employees. Exposes a derived `has_password`
// flag instead of the raw hash so the admin UI can render an "אין סיסמה"
// badge for host/manager rows that still need one.
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('employees')
    .select('*')
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const out = (data || []).map((row: Record<string, unknown>) => ({
    ...sanitize(row),
    has_password: Boolean(row.password_hash),
  }))
  return NextResponse.json(out)
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

  const { password, ...rest } = parsed.data
  const insertRow: Record<string, unknown> = { ...rest }
  if (password) {
    insertRow.password_hash = await hashPassword(password)
  }

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('employees')
    .insert(insertRow)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    { ...sanitize(data), has_password: Boolean(data?.password_hash) },
    { status: 201 }
  )
}
