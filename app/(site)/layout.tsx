import Link from 'next/link'

// Public-site shell. Footer is required to link הצהרת נגישות from every
// public page (תקנה 35א), and we include תנאי שימוש + פרטיות for symmetry.
// /admin and /host live outside this layout group and don't get this footer.
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <footer
        dir="rtl"
        className="border-t border-cayo-burgundy/10 bg-white text-cayo-burgundy/60"
      >
        <div className="max-w-3xl mx-auto px-5 py-5 flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
          <p>© {new Date().getFullYear()} CAYO · כל הזכויות שמורות</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/terms" className="hover:text-cayo-burgundy hover:underline">
              תנאי שימוש
            </Link>
            <Link href="/privacy" className="hover:text-cayo-burgundy hover:underline">
              מדיניות פרטיות
            </Link>
            <Link href="/accessibility" className="hover:text-cayo-burgundy hover:underline">
              הצהרת נגישות
            </Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
