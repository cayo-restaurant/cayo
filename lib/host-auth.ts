// Host dashboard auth — a simple, standalone session system for the on-shift
// hostess. It is intentionally *not* tied to Google OAuth / NextAuth so the
// hostess can use a shared tablet with a personal phone + password instead of
// a personal Google account.
//
// Design:
//   - Each hostess (employee with role 'host' or 'manager') has a phone
//     number and a bcrypt password_hash stored in the employees table.
//   - Admin sets the password directly in the employees admin form. There
//     is intentionally no self-service change/reset flow.
//   - Successful login sets a signed cookie (cayo_host) valid for 12 hours
//     — long enough for a full shift, short enough that a forgotten tablet
//     won't leave the session open overnight.
//   - Cookie value is `<employeeId>.<issuedAt>.<hmacSha256Hex>` signed with
//     HOST_COOKIE_SECRET. Verification uses timingSafeEqual to resist
//     timing attacks.
//   - The host session is completely independent of the admin (NextAuth)
//     session — a valid host cookie does NOT grant admin access and vice
//     versa.
import crypto from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'cayo_host'
const MAX_AGE_SECONDS = 12 * 60 * 60 // 12 hours (one shift)

function getSecret(): string {
  // Prefer a dedicated secret, fall back to NEXTAUTH_SECRET so deploys that
  // already have one keep working. If neither is set, sign()/verify() will
  // still run but produce unstable output across restarts — guard with
  // isHostConfigured() where that matters.
  return process.env.HOST_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || ''
}

export function isHostConfigured(): boolean {
  // We no longer require HOST_PIN. Just need a signing secret — passwords
  // live in the employees table now.
  return Boolean(getSecret())
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
}

function buildToken(employeeId: string): string {
  const issuedAt = Date.now().toString()
  const payload = `${employeeId}.${issuedAt}`
  const sig = sign(payload)
  return `${payload}.${sig}`
}

interface HostSession {
  employeeId: string
  issuedAt: number
}

function verifyToken(token: string | undefined): HostSession | null {
  if (!token) return null
  const parts = token.split('.')
  // Accept only the new 3-part format: employeeId.issuedAt.sig
  if (parts.length !== 3) return null
  const [employeeId, issuedAtStr, sig] = parts
  if (!employeeId || !issuedAtStr || !sig) return null

  const expected = sign(`${employeeId}.${issuedAtStr}`)
  if (sig.length !== expected.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return null
    }
  } catch {
    return null
  }

  const issuedAt = Number(issuedAtStr)
  if (!Number.isFinite(issuedAt)) return null
  const ageMs = Date.now() - issuedAt
  if (ageMs < 0 || ageMs >= MAX_AGE_SECONDS * 1000) return null

  return { employeeId, issuedAt }
}

// Server-side: read the cayo_host cookie and return the session payload if
// it's valid and unexpired. Safe to call from API routes and server
// components. Returns null when there is no valid session.
export function getHostSession(): HostSession | null {
  const token = cookies().get(COOKIE_NAME)?.value
  return verifyToken(token)
}

// Convenience boolean for code paths that only care about presence.
export function isHostRequest(): boolean {
  return getHostSession() !== null
}

// Convenience getter for the employee id of the currently logged-in hostess.
export function getHostEmployeeId(): string | null {
  return getHostSession()?.employeeId ?? null
}

// Server-side role check used to gate /host/* pages. The staff cookie
// itself is role-agnostic (any active employee can hold one), but the
// hostess dashboard + map + marked list are only for employees whose
// roles include 'host' or 'manager'. Returns true iff the current session
// has an allowed role. Other roles are redirected to /staff.
//
// We intentionally duplicate the small DB lookup here rather than plumb
// the roles through the cookie — it keeps the cookie short and lets
// role changes take effect without forcing a re-login.
export async function hostSessionHasHostRole(): Promise<boolean> {
  const employeeId = getHostEmployeeId()
  if (!employeeId) return false
  // Lazy import to avoid pulling supabase into edge/runtime paths that
  // only check isHostRequest().
  const { getServiceClient } = await import('@/lib/supabase')
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('employees')
    .select('roles, active')
    .eq('id', employeeId)
    .single()
  if (error || !data || !data.active) return false
  const roles: string[] = Array.isArray(data.roles) ? data.roles : []
  return roles.includes('host') || roles.includes('manager')
}

// Single gate used by every /host/* page. Returns either { allow: true }
// (render the page) or { allow: false, redirect: <path> } (server-side
// redirect to that path).
//
// Decision tree:
//   1. If the caller is a signed-in admin (NextAuth allowlist), allow.
//      Admins can hop straight from /admin into /host without going
//      through the phone+password form — they already proved who they
//      are when they signed in with Google.
//   2. Else if there's no host cookie, send them to /host/login to sign
//      in as an employee.
//   3. Else if there's a host cookie but the employee's roles don't
//      include host/manager, send them to /staff (waiters / kitchen /
//      etc. only see the rota + shift-request form, not the floor).
//   4. Otherwise allow.
//
// Using a single helper here keeps the three /host/* page guards in
// lockstep — they all want the same answer.
export async function canViewHostUI(): Promise<
  { allow: true } | { allow: false; redirect: string }
> {
  // Lazy import: lib/auth pulls in next-auth's server helpers, which we
  // don't want to evaluate when this module is loaded for unrelated
  // reasons (e.g. a host-only API route).
  const { isAdminRequest } = await import('@/lib/auth')
  if (await isAdminRequest()) return { allow: true }
  if (!isHostRequest()) return { allow: false, redirect: '/host/login' }
  if (!(await hostSessionHasHostRole())) {
    return { allow: false, redirect: '/staff' }
  }
  return { allow: true }
}

function cookieAttrs(value: string, maxAge: number): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function issueHostCookieHeader(employeeId: string): string {
  return cookieAttrs(buildToken(employeeId), MAX_AGE_SECONDS)
}

export function clearHostCookieHeader(): string {
  return cookieAttrs('', 0)
}

// Rate limiter for /api/host/login — in-memory per-IP. Good enough for a
// single restaurant with a single serverless region; if we scale to many
// regions or go fully edge we'd want a shared store (e.g. upstash/Redis).
interface Attempt {
  count: number
  lockedUntil: number
}
const MAX_ATTEMPTS = 10
const LOCKOUT_MS = 60 * 1000
const attempts = new Map<string, Attempt>()

export function getLockoutRemaining(ip: string): number {
  const rec = attempts.get(ip)
  if (!rec) return 0
  const remaining = rec.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

export function registerFailedAttempt(ip: string): { locked: boolean; remainingMs: number } {
  const now = Date.now()
  const rec = attempts.get(ip)
  const newCount = (rec?.count || 0) + 1
  if (newCount >= MAX_ATTEMPTS) {
    attempts.set(ip, { count: 0, lockedUntil: now + LOCKOUT_MS })
    return { locked: true, remainingMs: LOCKOUT_MS }
  }
  attempts.set(ip, { count: newCount, lockedUntil: 0 })
  return { locked: false, remainingMs: 0 }
}

export function clearAttempts(ip: string) {
  attempts.delete(ip)
}
