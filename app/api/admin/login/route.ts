import { NextResponse } from 'next/server'

// Deprecated: password-based admin login was replaced by Google OAuth via NextAuth.
// See /api/auth/[...nextauth]. This endpoint is kept only to return a clear error
// if any stale client still calls it.
export async function POST() {
  return NextResponse.json(
    { error: 'Login moved to Google Sign-In. Go to /admin.' },
    { status: 410 }
  )
}
