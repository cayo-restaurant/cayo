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
  title: 'CAYO | בר קוקטיילים',
  description: 'CAYO - בר קוקטיילים טרופי בתל אביב. חוויה ייחודית בהשראה קובנית.',
  openGraph: {
    title: 'CAYO | בר קוקטיילים',
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
        <AuthProvider>
          {children}
          <AdminNav />
          <HostNav />
        </AuthProvider>
      </body>
    </html>
  )
}
