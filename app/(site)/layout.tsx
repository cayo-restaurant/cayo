import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Header />
      <main className="pt-16 sm:pt-20">{children}</main>
      <Footer />
    </>
  )
}
