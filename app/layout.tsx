import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
import AdminNav from '@/components/AdminNav'
import HostNav from '@/components/HostNav'
import AuthProvider from '@/components/AuthProvider'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.cayobar.com'),
  title: 'CAYO | בר קוקטיילים',
  description: 'CAYO - בר קוקטיילים ברמת השרון, בהשראה קובנית.',
  openGraph: {
    title: 'CAYO | בר קוקטיילים',
    description: 'חוויה קולינרית ייחודית בהשראה קובנית',
    type: 'website',
    url: 'https://www.cayobar.com',
    siteName: 'CAYO',
    locale: 'he_IL',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'CAYO — מסעדה ובר, תל אביב',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CAYO | בר קוקטיילים',
    description: 'חוויה קולינרית ייחודית בהשראה קובנית',
    images: ['/og-image.jpg'],
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
        <AuthProvider>
          {children}
          <AdminNav />
          <HostNav />
        </AuthProvider>
      </body>
    </html>
  )
}
