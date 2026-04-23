import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// "Coming Soon" gate — while the site isn't ready for public launch (missing
// legal content, accessibility statement details, etc.), we hide the real
// site from the public and show a minimal coming-soon page instead.
//
// Access for the owner + developer:
//   Visit any public URL with ?preview=<COMING_SOON_KEY>
//   e.g. https://cayobar.com/?preview=CAYO-PREVIEW
//   The middleware sets a signed-ish cookie (`cayo_preview`) that grants
//   access for 30 days. Clear the cookie to lose access.
//
// Flip COMING_SOON_ENABLED to false (or set env var COMING_SOON=off) once
// the site is ready to launch publicly.
const COMING_SOON_ENABLED = process.env.COMING_SOON !== 'off'
const PREVIEW_KEY = process.env.COMING_SOON_KEY || 'CAYO-PREVIEW'
const PREVIEW_COOKIE = 'cayo_preview'
const PREVIEW_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// Paths that are NEVER gated. Admin/host/api need to keep working for the
// owner + hostess + internal wiring; /coming-soon is the gate itself.
const BYPASS_PREFIXES = [
  '/admin',
  '/host',
  '/staff',
  '/api',
  '/coming-soon',
  '/_next',
  '/favicon',
  '/robots',
  '/sitemap',
]

export function middleware(req: NextRequest) {
  if (!COMING_SOON_ENABLED) {
    return NextResponse.next()
  }

  const { pathname, searchParams } = req.nextUrl

  // 1. Always allow bypass paths through.
  for (const prefix of BYPASS_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return NextResponse.next()
    }
  }

  // 2. Static assets (images, fonts, etc.) — let them through.
  //    These are files with an extension in the last path segment.
  const lastSegment = pathname.split('/').pop() || ''
  if (lastSegment.includes('.')) {
    return NextResponse.next()
  }

  // 3. Preview unlock via query string. Visit /?preview=<key> to drop a
  //    cookie and redirect to the clean URL.
  const previewParam = searchParams.get('preview')
  if (previewParam && previewParam === PREVIEW_KEY) {
    const cleanUrl = req.nextUrl.clone()
    cleanUrl.searchParams.delete('preview')
    const res = NextResponse.redirect(cleanUrl)
    res.cookies.set(PREVIEW_COOKIE, PREVIEW_KEY, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: PREVIEW_MAX_AGE,
      path: '/',
    })
    return res
  }

  // 4. Already unlocked? Pass through.
  const cookie = req.cookies.get(PREVIEW_COOKIE)?.value
  if (cookie && cookie === PREVIEW_KEY) {
    return NextResponse.next()
  }

  // 5. Otherwise: rewrite to the coming-soon page so the public URL stays
  //    visually "on" (no redirect hop, no URL change) while the visitor sees
  //    only the coming-soon content.
  const comingSoonUrl = req.nextUrl.clone()
  comingSoonUrl.pathname = '/coming-soon'
  comingSoonUrl.search = ''
  return NextResponse.rewrite(comingSoonUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
