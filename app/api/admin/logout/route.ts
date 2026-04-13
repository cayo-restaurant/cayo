import { NextResponse } from 'next/server'

// Deprecated: logout now happens client-side via NextAuth's signOut().
// Kept as a no-op so any stale client doesn't break.
export async function POST() {
  return NextResponse.json({ success: true })
}
