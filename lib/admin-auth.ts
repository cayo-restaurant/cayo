import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const COOKIE_NAME = 'cayo_admin'
const DEFAULT_PASSWORD = 'cayo2026'

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD
}

export function isAdminRequest(): boolean {
  const jar = cookies()
  const token = jar.get(COOKIE_NAME)?.value
  return !!token && token === getAdminPassword()
}

export function requireAdmin(): NextResponse | null {
  if (!isAdminRequest()) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }
  return null
}

export function setAdminCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, getAdminPassword(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  })
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
}

export { COOKIE_NAME }
