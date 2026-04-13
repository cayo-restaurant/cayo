import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-cayo-dark border-t border-cayo-cream/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <Image
              src="/images/cayo-logo-dark.png"
              alt="CAYO"
              width={120}
              height={48}
              className="h-10 w-auto mb-4"
            />
            <p className="text-cayo-cream/60 text-sm leading-relaxed">
              חוויה קולינרית ייחודית בהשראה קובנית,
              <br />
              בלב תל אביב.
            </p>
          </div>

          <div>
            <h3 className="text-cayo-copper font-semibold mb-4">ניווט</h3>
            <nav className="flex flex-col gap-2">
              <Link href="/menu" className="text-sm text-cayo-cream/60 hover:text-cayo-copper transition-colors">תפריט</Link>
              <Link href="/reservation" className="text-sm text-cayo-cream/60 hover:text-cayo-copper transition-colors">הזמנת מקום</Link>
              <Link href="/about" className="text-sm text-cayo-cream/60 hover:text-cayo-copper transition-colors">אודות</Link>
              <Link href="/contact" className="text-sm text-cayo-cream/60 hover:text-cayo-copper transition-colors">צור קשר</Link>
            </nav>
          </div>

          <div>
            <h3 className="text-cayo-copper font-semibold mb-4">שעות פעילות</h3>
            <div className="text-sm text-cayo-cream/60 space-y-1">
              <p>ראשון – חמישי: 12:00 – 23:00</p>
              <p>שישי: 12:00 – 15:00</p>
              <p>שבת: 19:00 – 23:00</p>
            </div>
            <div className="mt-4">
              <a href="tel:03-1234567" className="text-sm text-cayo-copper hover:text-cayo-gold transition-colors">
                03-1234567
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-cayo-cream/10 text-center">
          <p className="text-xs text-cayo-cream/40">
            © {new Date().getFullYear()} CAYO. כל הזכויות שמורות.
          </p>
        </div>
      </div>
    </footer>
  )
}
