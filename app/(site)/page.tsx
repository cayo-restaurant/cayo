export const metadata = {
  title: 'CAYO | Coming Soon',
  description: 'CAYO Bar - Coming Soon',
}

export default function ComingSoonPage() {
  return (
    <div
      style={{
        fontFamily: "'Heebo', 'Assistant', sans-serif",
        backgroundColor: '#000000',
        color: '#ffffff',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '15vh',
        paddingBottom: '15vh',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: '7rem',
          fontWeight: 800,
          letterSpacing: '24px',
          textTransform: 'uppercase' as const,
          animation: 'fadeIn 1.2s ease-out',
        }}
      >
        CAYO
      </div>

      <div
        style={{
          display: 'inline-block',
          padding: '0.8rem 3.5rem',
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: '50px',
          fontSize: '1.3rem',
          fontWeight: 600,
          letterSpacing: '6px',
          textTransform: 'uppercase' as const,
          animation: 'fadeInUp 1s ease-out 0.9s both',
        }}
      >
        Coming Soon
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(25px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 480px) {
          div:first-child > div:first-child {
            font-size: 4.5rem !important;
            letter-spacing: 16px !important;
          }
        }
      `}</style>
    </div>
  )
}
