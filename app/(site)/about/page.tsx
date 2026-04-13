import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'אודות | CAYO',
  description: 'הסיפור מאחורי CAYO - בר קוקטיילים טרופי בתל אביב',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-cayo-cream">
      {/* Hero */}
      <section className="relative h-80 sm:h-[28rem] overflow-hidden">
        <Image
          src="/images/cayo-mural-art.png"
          alt="CAYO Mural"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-cayo-burgundy/60" />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-cayo-cream">הסיפור שלנו</h1>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 sm:py-24 section-padding">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-8 text-cayo-burgundy/70 text-lg leading-[1.9]">
            <p className="text-xl text-cayo-burgundy font-medium">
              CAYO נולד מתוך חלום להביא את האנרגיה הטרופית של קובה לרחובות תל אביב.
              הבר שלנו הוא יותר מסתם מקום לשתות — הוא חוויה שמתחילה
              מהרגע שאתם עוברים את הדלת.
            </p>
            <p>
              הקירות שלנו מספרים סיפורים דרך ציורי הקיר הטרופיים,
              האווירה חמה ואינטימית עם תאורה עמומה ועיצוב שמכבד את המקורות הקובניים
              תוך התאמה לרוח של תל אביב.
            </p>
            <p>
              הבר שלנו מביא ניסיון של שנים בברים מובילים,
              ומשלב טכניקות קלאסיות עם חומרי גלם מקומיים ועונתיים.
              כל קוקטייל מוכן בקפידה, עם תשומת לב לפרטים הקטנים ביותר.
            </p>
          </div>
        </div>
      </section>

      {/* Interior Image */}
      <section className="relative h-72 sm:h-96 overflow-hidden">
        <Image
          src="/images/cayo-interior.png"
          alt="CAYO Interior"
          fill
          className="object-cover"
        />
      </section>

      {/* Values */}
      <section className="py-16 sm:py-24 section-padding">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl sm:text-5xl font-black text-cayo-burgundy text-center mb-14">הערכים שלנו</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Authenticity */}
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-cayo-orange/15 flex items-center justify-center">
                <svg className="w-8 h-8 text-cayo-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-cayo-burgundy mb-3">אותנטיות</h3>
              <p className="text-cayo-burgundy/50 text-sm leading-relaxed">
                טעמים אמיתיים, ללא פשרות. כל קוקטייל נאמן למקורות הקובניים.
              </p>
            </div>

            {/* Freshness */}
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-cayo-teal/15 flex items-center justify-center">
                <svg className="w-8 h-8 text-cayo-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-cayo-burgundy mb-3">טריות</h3>
              <p className="text-cayo-burgundy/50 text-sm leading-relaxed">
                חומרי גלם טריים ועונתיים, ספקים מקומיים, הכנה יומיומית.
              </p>
            </div>

            {/* Experience */}
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-cayo-red/15 flex items-center justify-center">
                <svg className="w-8 h-8 text-cayo-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-cayo-burgundy mb-3">חוויה</h3>
              <p className="text-cayo-burgundy/50 text-sm leading-relaxed">
                כל ביקור הוא חוויה. מהמוזיקה דרך העיצוב ועד לכוס.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-cayo-burgundy py-14 text-center">
        <h3 className="text-2xl font-bold text-cayo-cream mb-3">בואו לחוות את CAYO</h3>
        <p className="text-cayo-cream/50 mb-6">שמרו מקום ובואו לגלות את הטעמים שלנו</p>
        <a
          href="/reservation"
          className="inline-block px-8 py-3.5 bg-cayo-orange text-cayo-cream font-bold rounded-full hover:bg-cayo-red transition-colors"
        >
          הזמינו שולחן
        </a>
      </section>
    </div>
  )
}
