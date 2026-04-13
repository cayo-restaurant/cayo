import Image from 'next/image'
import Link from 'next/link'
import Button from '@/components/ui/Button'

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <Image
          src="/images/cayo-interior.png"
          alt="CAYO Interior"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-cayo-dark/70" />
        <div className="relative z-10 text-center px-4">
          <Image
            src="/images/cayo-logo-dark.png"
            alt="CAYO"
            width={280}
            height={112}
            className="mx-auto mb-8 h-20 sm:h-28 w-auto"
            priority
          />
          <p className="text-cayo-cream/80 text-lg sm:text-xl mb-8 max-w-md mx-auto">
            חוויה קולינרית טרופית בלב תל אביב
          </p>
          <Link href="/reservation">
            <Button size="lg" className="text-lg">
              הזמן מקום
            </Button>
          </Link>
        </div>
      </section>

      {/* About Blurb */}
      <section className="py-20 section-padding">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-cayo-cream mb-6">
            ברוכים הבאים ל-CAYO
          </h2>
          <p className="text-cayo-cream/70 text-lg leading-relaxed max-w-2xl mx-auto">
            CAYO הוא בית של טעמים, צבעים ותחושות. מהרגע שתיכנסו,
            תרגישו את האווירה הטרופית שעוטפת אתכם — מהציורים על הקירות,
            דרך המנות שנבנו בהשראה קובנית, ועד לקוקטיילים שמוכנים בקפידה.
            הגענו לפה כדי ליצור חוויה שלא תשכחו.
          </p>
        </div>
      </section>

      {/* Mural Divider */}
      <section className="relative h-64 sm:h-80 overflow-hidden">
        <Image
          src="/images/cayo-mural-art.png"
          alt="CAYO Mural Art"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-cayo-dark via-transparent to-cayo-dark" />
      </section>

      {/* Hours & Address */}
      <section className="py-20 section-padding">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h3 className="text-2xl font-bold text-cayo-copper mb-6">שעות פעילות</h3>
            <div className="space-y-3 text-cayo-cream/70">
              <div className="flex justify-between border-b border-cayo-cream/10 pb-3">
                <span>ראשון – חמישי</span>
                <span>12:00 – 23:00</span>
              </div>
              <div className="flex justify-between border-b border-cayo-cream/10 pb-3">
                <span>שישי</span>
                <span>12:00 – 15:00</span>
              </div>
              <div className="flex justify-between">
                <span>שבת</span>
                <span>19:00 – 23:00</span>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-cayo-copper mb-6">כתובת</h3>
            <div className="text-cayo-cream/70 space-y-2">
              <p>רחוב דיזנגוף 99, תל אביב</p>
              <a
                href="tel:03-1234567"
                className="block text-cayo-copper hover:text-cayo-gold transition-colors"
              >
                03-1234567
              </a>
            </div>
            <Link href="/reservation" className="inline-block mt-6">
              <Button variant="secondary">הזמנת מקום</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
