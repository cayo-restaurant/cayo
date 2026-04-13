interface CardProps {
  children: React.ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-cayo-burgundy/40 border border-cayo-cream/10 rounded-xl p-6 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  )
}
