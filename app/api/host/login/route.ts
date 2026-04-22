import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import {
  clearAttempts,
  getLockoutRemaining,
  isHostConfigured,
  issueHostCookieHeader,
  registerFailedAttempt,
} from '@/lib/host-auth'
import { normalizePhone, verifyPassword } from '@/lib/password'
import { getServiceClient } from '@/lib/supabase'

// Hostess login — phone + password.
//
// Only employees with:
//   - active = true
//   - roles include 'host' or 'manager'
//   - password_hash is set
//   - not currently locked out (locked_until > now)
// can sign in. On 5 consecutive failures for a given account we set
// locked_until = now + 15min on their row. This is independent of the
// per-IP rate limit (which still applies on top).

const ROLES_ALLOWED = ['host', 'manager'] as const
const MAX_ACCOUNT_FAILURES = 5
const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000

function clientIp(): string {
  const h = headers()
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'unknown'
}

export async function POST(request: Request) {
  if (!isHostConfigured()) {
    return NextResponse.json(
      { error: 'גישת המארחת לא הוגדרה עדיין (HOST_COOKIE_SECRET חסר)' },
      { status: 500 }
    )
  }

  // Per-IP rate limit first — cheap and prevents enumeration.
  const ip = clientIp()
  const lockRemaining = getLockoutRemaining(ip)
  if (lockRemaining > 0) {
    return NextResponse.json(
      { error: `יותר מדי ניסיונות. נסי שוב בעוד ${Math.ceil(lockRemaining / 1000)} שניות.` },
      { status: 429 }
    )
  }

  let phoneRaw = ''
  let password = ''
  try {
    const body = await request.json()
    phoneRaw = String(body?.phone ?? '')
    password = String(body?.password ?? '')
  } catch {
    // fall through — empty values will fail
  }

  const phoneDigits = normalizePhone(phoneRaw)

  const fail = (status = 401) => {
    const { locked, remainingMs } = registerFailedAttempt(ip)
    if (locked) {
      return NextResponse.json(
        { error: `יותר מדי ניסיונות. חסום ל-${Math.ceil(remainingMs / 1000)} שניות.` },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: 'טלפון או סיסמה שגויים' }, { status })
  }

  if (!phoneDigits || !password) return fail(400)

  const sb = getServiceClient()

  // Load active employees that can possibly sign in. We scan in-memory
  // and match by normalized phone so a stored "050-123-4567" still
  // matches "0501234567" typed on the login screen. Employee count is
  // tiny (dozens at most) so this is cheaper than crafting a normalized
  // DB-side filter.
  const { data: rows, error } = await sb
    .from('employees')
    .select('id, full_name, roles, phone, password_hash, active, failed_login_count, locked_until')
    .eq('active', true)
    .not('password_hash', 'is', null)

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשרת' }, { status: 500 })
  }

  const candidate = (rows || []).find(
    (r: { phone?: string | null }) => normalizePhone(r.phone || '') === phoneDigits
  )

  // Constant-ish-time: always run a bcrypt compare even when no candidate
  // was found, to avoid leaking "phone exists" via response-time.
  const dummyHash = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4R1hQvE1FCcQr2iHUflPGwaAVYsK' // "placeholder"
  const hashToCheck = candidate?.password_hash || dummyHash
  const passwordOk = await verifyPassword(password, hashToCheck)

  if (!candidate || !candidate.password_hash) return fail(401)

  // Check account-level lockout before confirming password result.
  if (candidate.locked_until && new Date(candidate.locked_until).getTime() > Date.now()) {
    return NextResponse.json(
      { error: 'החשבון נעול זמנית. פני למנהל.' },
      { status: 429 }
    )
  }

  // Confirm the employee can use the host dashboard.
  const hasAllowedRole = Array.isArray(candidate.roles)
    ? candidate.roles.some((r: string) => (ROLES_ALLOWED as readonly string[]).includes(r))
    : false

  if (!passwordOk || !hasAllowedRole) {
    // Increment failed_login_count and lock account if threshold reached.
    const nextCount = (candidate.failed_login_count || 0) + 1
    const shouldLock = nextCount >= MAX_ACCOUNT_FAILURES
    await sb
      .from('employees')
      .update({
        failed_login_count: shouldLock ? 0 : nextCount,
        locked_until: shouldLock ? new Date(Date.now() + ACCOUNT_LOCKOUT_MS).toISOString() : null,
      })
      .eq('id', candidate.id)
    return fail(401)
  }

  // Success — reset counters, stamp login, issue cookie.
  await sb
    .from('employees')
    .update({
      failed_login_count: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq('id', candidate.id)

  clearAttempts(ip)
  const res = NextResponse.json({
    success: true,
    employee: { id: candidate.id, full_name: candidate.full_name },
  })
  res.headers.set('Set-Cookie', issueHostCookieHeader(candidate.id))
  return res
}
