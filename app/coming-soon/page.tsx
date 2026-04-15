// Public coming-soon page shown by middleware.ts while the site is in
// soft-launch. Minimal, self-contained, and deliberately does NOT expose any
// business details (address, phone, legal entity) that would create
// accessibility-statement or privacy-policy obligations before those pages
// are ready.
//
// To preview the real site (owner + developer) visit:
//   /?preview=<COMING_SOON_KEY>
// which drops a cookie and unlocks access for 30 days.

export const metadata = {
  title: 'CAYO | בקרוב',
  description: 'CAYO — מסעדה ובר. פתיחה בקרוב.',
  robots: { index: false, follow: false },
}

export default function ComingSoonPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen flex flex-col items-center justify-center bg-cayo-cream text-cayo-burgundy px-6 text-center"
    >
      <div className="max-w-md">
        <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-4">CAYO</h1>
        <p className="text-xl md:text-2xl font-bold mb-8 opacity-90">
          מסעדה ובר · בקרוב
        </p>
        <p className="text-base md:text-lg leading-relaxed opacity-80">
          אנחנו עובדים על חוויה חדשה עבורכם.<br />
          נשמח לראותכם בקרוב.
        </p>
      </div>
    </main>
  )
}
