'use client'

import { useState } from 'react'
import { menu } from '@/data/menu'
import type { Metadata } from 'next'

export default function MenuPage() {
  const [activeCategory, setActiveCategory] = useState(0)

  return (
    <div className="min-h-screen py-12 section-padding">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold text-center text-cayo-cream mb-2">
          התפריט
        </h1>
        <p className="text-cayo-cream/50 text-center mb-10">
          טעמים טרופיים בהשראה קובנית
        </p>

        {/* Category Tabs */}
        <div className="flex justify-center gap-2 sm:gap-4 mb-12 flex-wrap">
          {menu.map((category, i) => (
            <button
              key={category.name}
              onClick={() => setActiveCategory(i)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                activeCategory === i
                  ? 'bg-cayo-copper text-cayo-cream'
                  : 'bg-cayo-cream/10 text-cayo-cream/60 hover:bg-cayo-cream/20'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* Menu Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {menu[activeCategory].items.map((item) => (
            <div
              key={item.name}
              className="bg-cayo-burgundy/30 border border-cayo-cream/10 rounded-xl p-5 hover:border-cayo-copper/30 transition-colors"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-cayo-cream">{item.name}</h3>
                  <p className="text-sm text-cayo-cream/50 mt-1">{item.description}</p>
                </div>
                <span className="text-cayo-copper font-bold text-lg whitespace-nowrap">
                  ₪{item.price}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
