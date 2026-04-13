import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" dir="rtl">
      <header className="bg-cayo-burgundy text-cayo-cream border-b border-cayo-cream/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/admin/reservations" className="font-bold text-lg">
            CAYO ניהול
          </Link>
          <Link href="/" className="text-sm text-cayo-cream/70 hover:text-cayo-cream transition-colors">
            חזרה לאתר
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
