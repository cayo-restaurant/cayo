'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface NavLink {
  href: string
  label: string
}

const LINKS: NavLink[] = [
  { href: '/admin', label: 'ניהול הזמנות' },
  { href: '/host', label: 'מצב מארחת' },
  { href: '/admin/map', label: 'מפת מסעדה' },
  { href: '/admin/employees', label: 'עובדים' },
  { href: '/admin/hours', label: 'סידור' },
]

export default function AdminNav() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  // Ref-based `inert` toggle — `inert` is a valid DOM attribute in all
  // modern browsers, but @types/react's JSX types don't always list it
  // yet. Setting it imperatively sidesteps the typing gap and keeps the
  // focus/pointer trap out of the closed drawer.
  const navRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!navRef.current) return
    if (open) {
      navRef.current.removeAttribute('inert')
    } else {
      navRef.current.setAttribute('inert', '')
    }
  }, [open])

  useEffect(() => {
    let mounted = true
    fetch('/api/admin/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (mounted) setIsAdmin(!!d.authenticated)
      })
      .catch(() => {
        if (mounted) setIsAdmin(false)
      })
    return () => {
      mounted = false
    }
  }, [pathname])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    setIsAdmin(false)
    router.push('/')
    router.refresh()
  }

  if (!isAdmin) return null

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="תפריט ניהול"
        aria-expanded={open}
        aria-controls="admin-nav-drawer"
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
        id="admin-nav-drawer"
        ref={navRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-nav-drawer-title"
        aria-hidden={!open}
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 bg-white border-l-2 border-cayo-burgundy/10 shadow-2xl transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        dir="rtl"
      >
        <div className="px-6 py-5 border-b-2 border-cayo-burgundy/10">
          <p className="text-xs font-bold text-cayo-burgundy/75">תפריט ניהול</p>
          <p id="admin-nav-drawer-title" className="text-lg font-black text-cayo-burgundy">CAYO</p>
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
            יציאה מניהול
          </button>
        </div>
      </nav>
    </>
  )
