import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Admin auth is handled inside /app/admin (client-side redirect to login screen)
// and inside the API routes using the cayo_admin cookie.
// Middleware just passes everything through.

export function middleware(_req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
