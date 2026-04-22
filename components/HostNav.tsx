'use client'

// Navigation drawer for the on-shift hostess.
//
// Mirrors AdminNav structurally — same layout, same trigger button — but
// limited to the two things a hostess should have access to during a
// shift: her reservation queue (/host) and the live restaurant map
// (/host/map). We intentionally exclude /admin/* so nothing in this menu
// can accidentally take her into the manager-only surface.
//
// Visibility rules:
//   - Rendered only when /api/host/me returns OK.
//   - Hidden when the user is also signed in as an admin (AdminNav covers
//     that surface with the full menu, so we don't want a second drawer
//     stacking on top).
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface NavLink {
  href: string
  label: string
}

const LINKS: NavLink[] = [
  { href: '/host', label: 'מצב מארחת' },
  { href: '/host/map', label: 'מפת מסעדה' },
]

export default function HostNav() {
  const [isHost, setIsHost] = useState<boolean | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [hostName, setHostName] = useState<string>('')
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const navRef = useRef<HTMLElement | null>(null)

  // Match AdminNav's inert-handling pattern to keep focus trapped when
  // the drawer is closed.
  useEffect(() => {
    if (!navRef.current) return
    if (open) navRef.current.removeAttribute('inert')
    else navRef.current.setAttribute('inert', '')
  }, [open])

  useEffect(() => {
    let mounted = true

    // Resolve host session via /api/host/me. Silent 401 => not a host.
    fetch('/api/host/me', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!mounted) return
        setIsHost(Boolean(data?.id))
        setHostName(data?.full_name || '')
      })
      .catch(() => {
        if (mounted) setIsHost(false)
      })

    // Resolve admin session. We suppress the host nav when the user also
    // holds an admin session to avoid two floating buttons overlapping.
    fetch('/api/admin/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (mounted) setIsAdmin(!!d?.authenticated)
      })
      .catch(() => {
        if (mounted) setIsAdmin(false)
      })

    return () => { mounted = false }
  }, [pathname])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  async function logout() {
    await fetch('/api/host/logout', { method: 'POST' })
    setIsHost(false)
    router.push('/host/login')
    router.refresh()
  }

  // Hide while session resolution is still pending OR if the user isn't
  // actually a host OR if they're an admin (AdminNav takes over there).
  if (!isHost) return null
  if (isAdmin) return null

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="תפריט מארחת"
        aria-expanded={open}
        aria-controls="host-nav-drawer"
        aria-haspopup="dialog"
        className="fixed bottom-5 left-5 z-50 w-12 h-12 rounded-full bg-cayo-burgundy text-white shadow-lg shadow-cayo-burgundy/30 hover:bg-cayo-burgundy/90 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cayo-burgundy/40 focus-visible:ring-offset-2"
      >
        {open ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        />
      )}

      <nav
        id="host-nav-drawer"
        ref={navRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-nav-drawer-title"
        aria-hidden={!open}
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 bg-white border-l-2 border-cayo-burgundy/10 shadow-2xl transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        dir="rtl"
      >
        <div className="px-6 py-5 border-b-2 border-cayo-burgundy/10">
          <p className="text-xs font-bold text-cayo-burgundy/75">תפריט מארחת</p>
          <p id="host-nav-drawer-title" className="text-lg font-black text-cayo-burgundy">
            {hostName ? `שלום, ${hostName}` : 'CAYO'}
          </p>
        </div>
        <div className="py-3">
          {LINKS.map(link => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block px-6 py-3 text-base font-bold transition-colors ${
                  active
                    ? 'bg-cayo-burgundy text-white'
                    : 'text-cayo-burgundy hover:bg-cayo-burgundy/5'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </div>
        <div className="border-t-2 border-cayo-burgundy/10 mt-2 pt-2">
          <button
            onClick={logout}
            className="w-full text-right px-6 py-3 text-base font-bold text-cayo-red hover:bg-cayo-red/5 transition-colors"
          >
            החלף משתמש
          </button>
        </div>
      </nav>
    </>
  )
}
