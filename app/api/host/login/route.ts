import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import {
  clearAttempts,
  getLockoutRemaining,
  isHostConfigured,
  issueHostCookieHeader,
  registerFailedAttempt,
  verifyPin,
} from '@/lib/host-auth'

function clientIp(): string {
  const h = headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip') || 'unknown'
}

export async function POST(request: Request) {
  if (!isHostConfigured()) {
    return NextResponse.json(
      { error: 'גישת המארחת לא הוגדרה עדיין (HOST_PIN / HOST_COOKIE_SECRET חסרים)' },
      { status: 500 }
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
