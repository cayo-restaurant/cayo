'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

const navLinks = [
  { href: '/', label: 'בית' },
  { href: '/menu', label: 'תפריט' },
  { href: '/about', label: 'אודות' },
  { href: '/contact', label: 'צור קשר' },
  { href: '/reservation', label: 'הזמנת מקום' },
]

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="fixed top-0 right-0 left-0 z-50 bg-cayo-dark/90 backdrop-blur-md border-b border-cayo-cream/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/images/cayo-logo-dark.png"
              alt="CAYO"
              width={100}
              height={40}
              className="h-8 sm:h-10 w-auto"
              priority
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm text-cayo-cream/80 hover:text-cayo-copper transition-colors ${
                  link.href === '/reservation' ? 'bg-cayo-copper/20 px-4 py-2 rounded-lg text-cayo-copper hover:bg-cayo-copper/30' : ''
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-cayo-cream p-2"
            aria-label="תפריט"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden bg-cayo-dark/95 backdrop-blur-md border-t border-cayo-cream/10">
          <nav className="flex flex-col px-4 py-4 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="text-cayo-cream/80 hover:text-cayo-copper py-3 px-4 rounded-lg hover:bg-cayo-cream/5 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
