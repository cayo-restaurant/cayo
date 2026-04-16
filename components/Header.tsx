'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

const navLinks = [
  { href: '/contact', label: 'צור קשר' },
]

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-cayo-burgundy shadow-lg shadow-cayo-burgundy/20'
          : 'bg-cayo-burgundy'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <span className="text-cayo-cream text-2xl sm:text-3xl font-black tracking-[0.15em]">
              CAYO
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-cayo-cream/80 hover:text-cayo-cream transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/reservation"
              className="px-6 py-2.5 bg-cayo-orange text-cayo-cream text-sm font-bold rounded-full hover:bg-cayo-red transition-colors"
            >
              הזמנת מקום
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-cayo-cream p-2"
            aria-label="תפריט"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-cayo-burgundy border-t border-cayo-cream/10">
          <nav className="flex flex-col px-4 py-4 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="text-cayo-cream/80 hover:text-cayo-cream py-3 px-4 rounded-lg hover:bg-cayo-cream/10 transition-colors text-lg"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 px-4">
              <Link
                href="/reservation"
                onClick={() => setIsOpen(false)}
                className="block text-center px-6 py-3 bg-cayo-orange text-cayo-cream font-bold rounded-full text-lg"
              >
                הזמנת מקום
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
