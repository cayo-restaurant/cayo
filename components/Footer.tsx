import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-cayo-burgundy text-cayo-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <Image
              src="/images/cayo-logo-dark.png"
              alt="CAYO"
              width={130}
              height={52}
              className="h-12 w-auto mb-5"
            />
            <p className="text-cayo-cream/50 text-sm leading-relaxed max-w-xs">
              קוקטיילים צבעוניים ואווירה אקזוטית שמרגישה כמו חופשה.
              בואו לגלות את CAYO.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-cayo-orange font-bold text-lg mb-5">ניווט</h3>
            <nav className="flex flex-col gap-3">
              <Link href="/reservation" className="text-sm text-cayo-cream/50 hover:text-cayo-teal transition-colors">הזמנת מקום</Link>
              <Link href="/contact" className="text-sm text-cayo-cream/50 hover:text-cayo-teal transition-colors">צור קשר</Link>
            </nav>
          </div>

          {/* Hours & Contact */}
          <div>
            <h3 className="text-cayo-orange font-bold text-lg mb-5">שעות פעילות</h3>
            <div className="text-sm text-cayo-cream/50 space-y-2">
              <div className="flex justify-between">
                <span>ראשון – חמישי</span>
                <span className="text-cayo-cream/70">12:00 – 23:00</span>
              </div>
              <div className="flex justify-between">
                <span>שישי</span>
                <span className="text-cayo-cream/70">12:00 – 15:00</span>
              </div>
              <div className="flex justify-between">
                <span>שבת</span>
                <span className="text-cayo-cream/70">19:00 – 23:00</span>
              </div>
            </div>
            <div className="mt-6">
              <a href="tel:03-1234567" className="text-cayo-teal hover:text-cayo-cream transition-colors text-lg font-semibold">
                03-1234567
              </a>
              <p className="text-cayo-cream/40 text-xs mt-1">רחוב דיזנגוף 99, תל אביב</p>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-cayo-cream/10 text-center">
          <p className="text-xs text-cayo-cream/30">
            © {new Date().getFullYear()} CAYO. כל הזכויות שמורות.
          </p>
        </div>
      </div>
    </footer>
  )
}
