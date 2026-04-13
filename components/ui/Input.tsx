'use client'

import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export default function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id || label.replace(/\s/g, '-')

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="block text-sm text-cayo-cream/80 mb-1.5">
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full bg-cayo-dark/50 border border-cayo-cream/20 rounded-lg px-4 py-3 text-cayo-cream placeholder:text-cayo-cream/30 focus:outline-none focus:border-cayo-copper focus:ring-1 focus:ring-cayo-copper/50 transition-colors ${error ? 'border-red-400' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  )
}
