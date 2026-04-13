import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'צור קשר | CAYO',
  description: 'צרו קשר עם מסעדת CAYO - כתובת, טלפון, שעות פעילות',
}

export default function ContactPage() {
  return (
    <div className="min-h-screen py-12 section-padding">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold text-center text-cayo-cream mb-2">
          צור קשר
        </h1>
        <p className="text-cayo-cream/50 text-center mb-12">
          נשמח לשמוע מכם
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Info */}
          <div className="space-y-8">
            <div className="bg-cayo-burgundy/30 border border-cayo-cream/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-cayo-copper mb-4">כתובת</h2>
              <p className="text-cayo-cream/70">רחוב דיזנגוף 99</p>
              <p className="text-cayo-cream/70">תל אביב-יפו</p>
            </div>

            <div className="bg-cayo-burgundy/30 border border-cayo-cream/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-cayo-copper mb-4">טלפון</h2>
              <a
                href="tel:03-1234567"
                className="text-2xl text-cayo-cream hover:text-cayo-copper transition-colors font-semibold"
              >
                03-1234567
              </a>
              <p className="text-sm text-cayo-cream/50 mt-2">לחצו להתקשר</p>
            </div>

            <div className="bg-cayo-burgundy/30 border border-cayo-cream/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-cayo-copper mb-4">שעות פעילות</h2>
              <div className="space-y-2 text-cayo-cream/70">
                <div className="flex justify-between">
                  <span>ראשון – חמישי</span>
                  <span>12:00 – 23:00</span>
                </div>
                <div className="flex justify-between">
                  <span>שישי</span>
                  <span>12:00 – 15:00</span>
                </div>
                <div className="flex justify-between">
                  <span>שבת</span>
                  <span>19:00 – 23:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="bg-cayo-burgundy/30 border border-cayo-cream/10 rounded-xl overflow-hidden h-[400px] lg:h-full min-h-[400px]">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3381.0!2d34.7745!3d32.0750!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzLCsDA0JzMwLjAiTiAzNMKwNDYnMjguMiJF!5e0!3m2!1siw!2sil!4v1"
              width="100%"
              height="100%"
              style={{ border: 0, minHeight: '400px' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="מיקום CAYO"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
