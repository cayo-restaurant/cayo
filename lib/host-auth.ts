// Host dashboard auth — a simple, standalone session system for the on-shift
// hostess. It is intentionally *not* tied to Google OAuth / NextAuth so the
// hostess can use a shared tablet with a short PIN instead of a personal
// Google account.
//
// Design:
//   - A 4-digit PIN is stored in env (HOST_PIN)
//   - Successful login sets a signed cookie (cayo_host) valid for 30 days
//   - Cookie value is `<issuedAt>.<hmacSha256Hex>` signed with HOST_COOKIE_SECRET
//   - Verification uses timingSafeEqual to resist timing attacks
//   - The host session is completely independent of the admin session — a
//     valid host cookie does NOT grant admin access and vice versa
import crypto from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'cayo_host'
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

function getSecret(): string {
  // Prefer a dedicated secret, fall back to NEXTAUTH_SECRET so deploys that
  // already have one keep working. If neither is set, auth will fail closed
  // (sign() will still work but verification won't match across restarts
  // because an empty secret is effectively random behaviour — we guard on that
  // in isHostConfigured() instead).
  return process.env.HOST_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || ''
}

export function isHostConfigured(): boolean {
  return Boolean(process.env.HOST_PIN && getSecret())
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
}

function buildToken(): string {
  const issuedAt = Date.now().toString()
  const sig = sign(issuedAt)
  return `${issuedAt}.${sig}`
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const issuedAt = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(issuedAt)
  // timingSafeEqual requires equal-length buffers; guard against length mismatch
  if (sig.length !== expected.length) return false
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return false
    }
  } catch {
    return false
  }
  const issued = Number(issuedAt)
  if (!Number.isFinite(issued)) return false
  const ageMs = Date.now() - issued
  return ageMs >= 0 && ageMs < MAX_AGE_SECONDS * 1000
}

// Server-side: read the cayo_host cookie and return true if it's a valid,
// unexpired host session. Safe to call from API routes and server components.
export function isHostRequest(): boolean {
  const token = cookies().get(COOKIE_NAME)?.value
  return verifyToken(token)
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

export function issueHostCookieHeader(): string {
  return cookieAttrs(buildToken(), MAX_AGE_SECONDS)
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
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60 * 1000
const attempts = new Map<string, Attempt>()

// Per-PIN global backoff: after 100 failed attempts across all IPs, freeze for 5 min
interface PinBackoff {
  failureCount: number
  frozenUntil: number
}
const PIN_BACKOFF_THRESHOLD = 100
const PIN_FREEZE_MS = 5 * 60 * 1000
const pinBackoff: PinBackoff = { failureCount: 0, frozenUntil: 0 }

export function getLockoutRemaining(ip: string): number {
  const rec = attempts.get(ip)
  if (!rec) return 0
  const remaining = rec.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

export function getPinBackoffRemaining(): number {
  const remaining = pinBackoff.frozenUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

export function registerFailedAttempt(ip: string): { locked: boolean; remainingMs: number } {
  const now = Date.now()
  
  // Check global PIN backoff first
  if (pinBackoff.frozenUntil > now) {
    return { locked: true, remainingMs: pinBackoff.frozenUntil - now }
  }

  // Increment global failure counter
  pinBackoff.failureCount++
  if (pinBackoff.failureCount >= PIN_BACKOFF_THRESHOLD) {
    pinBackoff.frozenUntil = now + PIN_FREEZE_MS
    return { locked: true, remainingMs: PIN_FREEZE_MS }
  }

  // Per-IP lockout
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
  // Reset global failure counter on successful login
  pinBackoff.failureCount = 0
  pinBackoff.frozenUntil = 0
}

export function verifyPin(pin: string): boolean {
  const expected = process.env.HOST_PIN || ''
  if (!expected) return false
  // Constant-time comparison over the raw PIN bytes
  const a = Buffer.from(String(pin))
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
