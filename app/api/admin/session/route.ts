import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/auth'

// Legacy: returns { authenticated: boolean } based on current NextAuth session +
// email allowlist. Kept so nothing old breaks; new client code should use
// useSession() from next-auth/react instead.
export async function GET() {
  return NextResponse.json({ authenticated: await isAdminRequest() })
}
