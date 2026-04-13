'use client'

import { menu } from '@/data/menu'

export default function MenuPage() {
  return (
    <div className="bg-cayo-burgundy flex-1 py-10 sm:py-16 section-padding">
      <div className="w-full max-w-2xl mx-auto relative">
        {/* Teal decorative border strips on sides */}
        <div className="absolute top-0 bottom-0 right-0 w-3 sm:w-4 bg-cayo-teal z-10 rounded-tr-lg rounded-br-lg" />
        <div className="absolute top-0 bottom-0 left-0 w-3 sm:w-4 bg-cayo-teal z-10 rounded-tl-lg rounded-bl-lg" />

        {/* The menu card */}
        <div className="bg-cayo-cream rounded-lg mx-3 sm:mx-4 py-10 sm:py-14 px-6 sm:px-12">
          {/* Title */}
          <h1 className="text-4xl sm:text-5xl font-black text-cayo-burgundy text-center mb-10">
            פותחים שולחן
          </h1>

          {/* All categories */}
          <div className="space-y-10">
            {menu.map((category) => (
              <div key={category.name}>
                {/* Category name */}
                <h2 className="text-xl sm:text-2xl font-black text-cayo-burgundy text-center mb-5 pb-2 border-b-2 border-cayo-burgundy/15">
                  {category.name}
                </h2>

                {/* Items */}
                <div className="space-y-4">
                  {category.items.map((item) => (
                    <div key={item.name}>
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-cayo-orange font-black text-base">₪{item.price}</span>
                        <span className="font-bold text-cayo-burgundy text-base">{item.name}</span>
                      </div>
                      <p className="text-xs text-cayo-burgundy/50 mt-0.5 leading-relaxed text-right">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom note */}
          <div className="mt-12 pt-6 border-t-2 border-cayo-burgundy/15 text-center">
            <p className="text-sm text-cayo-burgundy/40">
              המחירים כוללים מע״מ | לתשומת לבכם, ייתכנו שינויים בתפריט
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
