import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow admin routes, API routes, static files, and the home page
  if (
    pathname === '/' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    // Admin auth check
    if (
      pathname.startsWith('/admin') &&
      !pathname.startsWith('/admin/login')
    ) {
      const res = NextResponse.next()
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => req.cookies.getAll().map(c => ({ name: c.name, value: c.value })),
            setAll: (cookies) => {
              cookies.forEach(({ name, value, options }) => {
                res.cookies.set(name, value, options)
              })
            },
          },
        }
      )
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        return NextResponse.redirect(new URL('/admin/login', req.url))
      }
      return res
    }

    return NextResponse.next()
  }

  // Block all other pages — redirect to home (under construction)
  return NextResponse.redirect(new URL('/', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
