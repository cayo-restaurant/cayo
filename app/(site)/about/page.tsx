import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'אודות | CAYO',
  description: 'הסיפור מאחורי CAYO - מסעדה ובר טרופי בתל אביב',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative h-72 sm:h-96 overflow-hidden">
        <Image
          src="/images/cayo-mural-art.png"
          alt="CAYO Mural"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-cayo-dark/60" />
        <div className="relative z-10 h-full flex items-center justify-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-cayo-cream">הסיפור שלנו</h1>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 sm:py-20 section-padding">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-6 text-cayo-cream/70 text-lg leading-relaxed">
            <p>
              CAYO נולד מתוך חלום להביא את האנרגיה הטרופית של קובה לרחובות תל אביב.
              הבר-מסעדה שלנו הוא יותר מסתם מקום לאכול — הוא חוויה שמתחילה
              מהרגע שאתם עוברים את הדלת.
            </p>
            <p>
              הקירות שלנו מספרים סיפורים דרך ציורי הקיר הטרופיים,
              האווירה חמה ואינטימית עם תאורה עמומה ועיצוב שמכבד את המקורות הקובניים
              תוך התאמה לרוח של תל אביב.
            </p>
            <p>
              השף שלנו מביא ניסיון של שנים במטבחים מובילים,
              ומשלב טכניקות קלאסיות עם חומרי גלם מקומיים ועונתיים.
              כל מנה מוכנה בקפידה, עם תשומת לב לפרטים הקטנים ביותר.
            </p>
          </div>
        </div>
      </section>

      {/* Interior Image */}
      <section className="relative h-64 sm:h-96 overflow-hidden">
        <Image
          src="/images/cayo-interior.png"
          alt="CAYO Interior"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-cayo-dark via-transparent to-cayo-dark" />
      </section>

      {/* Values */}
      <section className="py-16 sm:py-20 section-padding">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-cayo-cream mb-12">הערכים שלנו</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cayo-copper/20 flex items-center justify-center">
                <span className="text-2xl">🔥</span>
              </div>
              <h3 className="text-xl font-semibold text-cayo-copper mb-2">אותנטיות</h3>
              <p className="text-cayo-cream/60 text-sm">
                טעמים אמיתיים, ללא פשרות. כל מנה נאמנה למקורות הקובניים.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cayo-teal/20 flex items-center justify-center">
                <span className="text-2xl">🌿</span>
              </div>
              <h3 className="text-xl font-semibold text-cayo-teal mb-2">טריות</h3>
              <p className="text-cayo-cream/60 text-sm">
                חומרי גלם טריים ועונתיים, ספקים מקומיים, הכנה יומיומית.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cayo-gold/20 flex items-center justify-center">
                <span className="text-2xl">✨</span>
              </div>
              <h3 className="text-xl font-semibold text-cayo-gold mb-2">חוויה</h3>
              <p className="text-cayo-cream/60 text-sm">
                כל ביקור הוא חוויה. מהמוזיקה דרך העיצוב ועד לצלחת.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
