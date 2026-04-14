'use client'

// PIN entry for the hostess. Deliberately simple: 4 large digits, big touch
// targets (this will usually run on a tablet near the host stand). Auto-submits
// when the 4th digit is typed.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import cayoLogo from '../../../cayo_brand_page_005.png'

const PIN_LENGTH = 4

export default function HostLoginPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the hidden input so the on-screen keyboard pops up on mobile
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(code: string) {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/host/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      })
      if (res.ok) {
        router.replace('/host')
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'קוד שגוי')
      setPin('')
      // Re-focus so the user can type again immediately
      setTimeout(() => inputRef.current?.focus(), 0)
    } catch {
      setError('שגיאת חיבור')
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH)
    setPin(v)
    setError('')
    if (v.length === PIN_LENGTH && !submitting) {
      submit(v)
    }
  }

  return (
    <div
      className="min-h-screen bg-white flex items-center justify-center px-6"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="max-w-sm w-full">
        <Link href="/" className="block mb-10" onClick={e => e.stopPropagation()}>
          <div className="w-[160px] mx-auto overflow-hidden">
            <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
          </div>
        </Link>

        <h1 className="text-2xl font-black text-cayo-burgundy text-center mb-2">
          כניסת מארחת
        </h1>
        <p className="text-cayo-burgundy/50 text-center text-sm mb-8">
          הזינו את קוד המשמרת
        </p>

        {/* Visual pin boxes — the real input is hidden */}
        <div className="flex justify-center gap-3 mb-6" dir="ltr">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => {
            const filled = i < pin.length
            return (
              <div
                key={i}
                className={`w-14 h-16 rounded-2xl border-2 flex items-center justify-center text-3xl font-black transition-colors ${
                  error
                    ? 'border-cayo-red/60 bg-cayo-red/5 text-cayo-red'
                    : filled
                    ? 'border-cayo-burgundy bg-cayo-burgundy/5 text-cayo-burgundy'
                    : 'border-cayo-burgundy/20 text-cayo-burgundy/40'
                }`}
              >
                {filled ? '•' : ''}
              </div>
            )
          })}
        </div>

        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={onChange}
          className="sr-only"
          aria-label="קוד משמרת"
        />

        <div className="min-h-[28px] text-center">
          {error && (
            <p className="text-sm text-cayo-red font-bold">{error}</p>
          )}
          {submitting && !error && (
            <p className="text-sm text-cayo-burgundy/50 font-bold">בודק...</p>
          )}
        </div>

        <p className="text-xs text-cayo-burgundy/40 text-center mt-8">
          הקוד תקף לטאבלט זה בלבד ל-30 יום
        </p>
      </div>
    </div>
  )
}
