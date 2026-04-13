// Thin shim around lib/auth.ts so the rest of the codebase (API routes) can
// keep importing `isAdminRequest` / `requireAdmin` without change.
import { NextResponse } from 'next/server'
import { isAdminRequest as isAdminSession } from '@/lib/auth'

export async function isAdminRequest(): Promise<boolean> {
  return isAdminSession()
}

export async function requireAdmin(): Promise<NextResponse | null> {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }
  return null
}
