'use client'

// Staff login form — phone + password.
//
// Any active employee with a password can sign in here (not just host /
// manager). After login they land on /staff, a role-aware landing page
// that shows tiles for the screens they're allowed to see. Only employees
// whose roles include host/manager can then proceed to /host, /host/map,
// and /host/marked.
//
// There's only one error message on purpose (same text for "wrong phone"
// and "wrong password") so we don't leak which employees exist.
//
// This component is rendered by app/host/login/page.tsx, which first does
// a server-side check: if the visitor is already a signed-in admin
// (NextAuth allowlist), they get redirected straight to /host without
// ever seeing the form.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import cayoLogo from '../../../cayo_brand_page_005.png'

export default function HostLoginForm() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const phoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    phoneRef.current?.focus()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!phone.trim() || !password) {
      setError('יש למלא טלפון וסיסמה')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/host/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
      })
      if (res.ok) {
        // Land everyone on the role-aware /staff home. Host/manager can
        // proceed to /host from there; other roles see only the rota and
        // the shift-request form.
        router.replace('/staff')
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'טלפון או סיסמה שגויים')
      setPassword('')
    } catch {
      setError('שגיאת חיבור')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <Link href="/" className="block mb-10">
          <div className="w-[160px] mx-auto overflow-hidden">
            <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
          </div>
        </Link>

        <h1 className="text-2xl font-black text-cayo-burgundy text-center mb-2">
          כניסת צוות
        </h1>
        <p className="text-cayo-burgundy/50 text-center text-sm mb-8">
          טלפון וסיסמה שקיבלת מהמנהל
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="host-phone" className="block text-xs font-bold text-cayo-burgundy/70 mb-1.5">
              טלפון
            </label>
            <input
              id="host-phone"
              ref={phoneRef}
              type="tel"
              inputMode="tel"
              autoComplete="username"
              dir="ltr"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError('') }}
              className="w-full px-4 py-3 text-lg rounded-2xl border-2 border-cayo-burgundy/20 focus:border-cayo-burgundy outline-none transition-colors"
              placeholder="0501234567"
              aria-invalid={Boolean(error)}
            />
          </div>

          <div>
            <label htmlFor="host-password" className="block text-xs font-bold text-cayo-burgundy/70 mb-1.5">
              סיסמה
            </label>
            <div className="relative">
              <input
                id="host-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                className="w-full px-4 py-3 pl-12 text-lg rounded-2xl border-2 border-cayo-burgundy/20 focus:border-cayo-burgundy outline-none transition-colors"
                aria-invalid={Boolean(error)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-cayo-burgundy/60 hover:text-cayo-burgundy px-2 py-1"
                aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showPassword ? 'הסתר' : 'הצג'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-cayo-burgundy text-white text-base font-black rounded-2xl hover:bg-cayo-burgundy/90 active:scale-[0.99] transition disabled:opacity-60"
          >
            {submitting ? 'בודק...' : 'כניסה'}
          </button>

          <div className="min-h-[24px] text-center">
            {error && (
              <p role="alert" className="text-sm text-cayo-red font-bold">{error}</p>
            )}
          </div>
        </form>

        <p className="text-xs text-cayo-burgundy/40 text-center mt-6">
          ההתחברות תקפה ל-12 שעות, לאחר מכן תידרש כניסה מחדש
        </p>
      </div>
    </div>
  )
}
