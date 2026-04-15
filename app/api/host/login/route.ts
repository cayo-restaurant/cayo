import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import {
  clearAttempts,
  getLockoutRemaining,
  getPinBackoffRemaining,
  isHostConfigured,
  issueHostCookieHeader,
  registerFailedAttempt,
  verifyPin,
} from '@/lib/host-auth'

function clientIp(): string {
  const h = headers()
  // Prefer Vercel's x-real-ip; ignore client-supplied x-forwarded-for first-hop
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp
  // Fallback for non-Vercel deployment: use x-forwarded-for if available
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'unknown'
}

export async function POST(request: Request) {
  if (!isHostConfigured()) {
    return NextResponse.json(
      { error: 'גישת המארחת לא הוגדרה עדיין (HOST_PIN / HOST_COOKIE_SECRET חסרים)' },
      { status: 500 }
    )
  }

  // Check global PIN backoff
  const pinFreezeRemaining = getPinBackoffRemaining()
  if (pinFreezeRemaining > 0) {
    return NextResponse.json(
      { error: `יותר מדי ניסיונות כללי. נסי שוב בעוד ${Math.ceil(pinFreezeRemaining / 1000)} שניות.` },
      { status: 429 }
    )
  }

  const ip = clientIp()
  const lockRemaining = getLockoutRemaining(ip)
  if (lockRemaining > 0) {
    return NextResponse.json(
      { error: `יותר מדי ניסיונות. נסי שוב בעוד ${Math.ceil(lockRemaining / 1000)} שניות.` },
      { status: 429 }
    )
  }

  let pin = ''
  try {
    const body = await request.json()
    pin = String(body?.pin ?? '')
  } catch {
    // fall through — empty pin will fail verifyPin
  }

  if (!verifyPin(pin)) {
    const { locked, remainingMs } = registerFailedAttempt(ip)
    if (locked) {
      return NextResponse.json(
        { error: `יותר מדי ניסיונות. חסומה ל-${Math.ceil(remainingMs / 1000)} שניות.` },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: 'קוד שגוי' }, { status: 401 })
  }

  clearAttempts(ip)
  const res = NextResponse.json({ success: true })
  res.headers.set('Set-Cookie', issueHostCookieHeader())
  return res
}
