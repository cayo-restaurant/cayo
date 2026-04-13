import Link from 'next/link'
import Image from 'next/image'
import cayoLogo from '../../cayo_brand_page_005.png'

export const metadata = {
  title: 'CAYO | בר ומסעדה',
  description: 'CAYO - קוקטיילים צבעוניים ואווירה אקזוטית שמרגישה כמו חופשה',
}

export default function HomePage() {
  return (
    <div className="h-screen bg-white flex flex-col items-center justify-between overflow-hidden py-12 sm:py-16 px-8">
      {/* Logo - top center */}
      <div className="flex-1 flex items-center justify-center animate-fade-in">
        <div className="w-[280px] sm:w-[400px] md:w-[500px] overflow-hidden">
          <Image
            src={cayoLogo}
            alt="CAYO"
            className="w-full h-auto scale-[1.35]"
            priority
          />
        </div>
      </div>

      {/* CTA Button - centered below logo */}
      <div className="mb-8 animate-fade-in-up">
        <Link
          href="/reservation"
          className="inline-block bg-cayo-burgundy hover:bg-cayo-burgundy/90 text-white font-bold text-base sm:text-lg px-10 sm:px-12 py-3 sm:py-4 rounded-full transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-cayo-burgundy/30"
        >
          הזמנת מקום
        </Link>
      </div>

      {/* Bottom left label */}
      <p className="self-start text-cayo-burgundy/50 text-sm sm:text-base tracking-wide animate-fade-in-up-delay">
        בר קוקטיילים
      </p>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 1s ease-out;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out 0.3s both;
        }
        .animate-fade-in-up-delay {
          animation: fadeInUp 0.8s ease-out 0.6s both;
        }
      `}</style>
    </div>
  )
}
