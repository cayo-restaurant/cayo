'use client'

// Shared landing page for every logged-in staff member.
//
// Renders role-aware tiles:
//   - "הסידור" → /staff/rota          (everyone)
//   - "הגשת משמרות" → /staff/submit    (everyone)
//   - "מסך משמרת" → /host              (host or manager only)
//   - "ניהול" → /admin                 (admin session only)
//
// Non-host/manager employees CANNOT see the hostess dashboard or map —
// the tile is hidden here, and the /host/* pages themselves redirect
// them back here if they try to navigate directly.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import cayoLogo from '../../cayo_brand_page_005.png'

interface Me {
  id: string
  full_name: string
  roles: string[]
}

export default function StaffHome() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Resolve both sessions in parallel. /api/host/me identifies the
    // logged-in employee; /api/admin/session tells us whether this
    // browser also has a manager/admin session (Google-backed).
    Promise.all([
      fetch('/api/host/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)),
      fetch('/api/admin/session', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)),
    ])
      .then(([meData, adminData]) => {
        if (cancelled) return
        if (meData?.id) setMe({ id: meData.id, full_name: meData.full_name, roles: meData.roles || [] })
        if (adminData?.authenticated) setIsAdmin(true)
      })
      .catch(() => { /* silently degrade — the server already gated access */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function logout() {
    await fetch('/api/host/logout', { method: 'POST' })
    router.replace('/host/login')
  }

  const roles = me?.roles || []
  const canHost = roles.includes('host') || roles.includes('manager')

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b-2 border-cayo-burgundy/10 bg-white">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <button
            onClick={logout}
            className="text-xs font-bold text-cayo-burgundy/60 hover:text-cayo-burgundy transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cayo-burgundy/60 focus-visible:ring-offset-2 py-1"
          >
            יציאה
          </button>
          <div className="flex items-center gap-3">
            <div className="text-end">
              <h1 className="text-lg font-black text-cayo-burgundy leading-tight">
                {me ? `שלום, ${me.full_name}` : 'שלום'}
              </h1>
              <p className="text-xs font-bold text-cayo-burgundy/60 leading-tight mt-0.5">
                מה עושים היום?
              </p>
            </div>
            <div className="w-[60px] overflow-hidden">
              <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
            </div>
          </div>
        </div>
      </header>

      {/* Tiles */}
      <main className="max-w-3xl mx-auto px-5 py-6">
        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-16 font-bold">טוען...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Tile
              href="/staff/rota"
              title="הסידור"
              subtitle="צפייה בסידור העבודה"
            />
            <Tile
              href="/staff/submit"
              title="הגשת משמרות"
              subtitle="סמני זמינות לשבוע הקרוב"
            />
            {canHost && (
              <Tile
                href="/host"
                title="מסך משמרת"
                subtitle="ניהול ההזמנות של המשמרת"
                accent
              />
            )}
            {isAdmin && (
              <Tile
                href="/admin"
                title="ניהול"
                subtitle="מנהל/ת המסעדה"
                accent
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function Tile({
  href,
  title,
  subtitle,
  accent = false,
}: {
  href: string
  title: string
  subtitle: string
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border-2 px-5 py-6 flex flex-col justify-between min-h-[130px] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cayo-burgundy/60
        ${accent
          ? 'bg-cayo-burgundy text-white border-cayo-burgundy hover:bg-cayo-burgundy/90'
          : 'bg-white border-cayo-burgundy/15 text-cayo-burgundy hover:border-cayo-burgundy/40'}`}
    >
      <h2 className={`text-xl font-black leading-tight ${accent ? 'text-white' : 'text-cayo-burgundy'}`}>
        {title}
      </h2>
      <p className={`text-xs font-bold leading-tight mt-2 ${accent ? 'text-white/80' : 'text-cayo-burgundy/70'}`}>
        {subtitle}
      </p>
    </Link>
  )
}
