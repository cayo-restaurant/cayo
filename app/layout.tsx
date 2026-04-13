import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
import AdminNav from '@/components/AdminNav'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CAYO | מסעדה ובר',
  description: 'CAYO - מסעדה ובר טרופי בתל אביב. חוויה קולינרית ייחודית בהשראה קובנית.',
  openGraph: {
    title: 'CAYO | מסעדה ובר',
    description: 'חוויה קולינרית ייחודית בהשראה קובנית',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-heebo antialiased">
        {children}
        <AdminNav />
      </body>
    </html>
  )
}
