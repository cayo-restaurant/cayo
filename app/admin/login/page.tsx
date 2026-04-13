'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = getSupabase()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('שם משתמש או סיסמה שגויים')
      setLoading(false)
      return
    }

    router.push('/admin/reservations')
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8">כניסת מנהל</h1>
        <form onSubmit={handleLogin} className="bg-white border rounded-xl p-6 space-y-4 shadow-sm">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">אימייל</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cayo-burgundy/50"
              dir="ltr"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">סיסמה</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cayo-burgundy/50"
              dir="ltr"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cayo-burgundy text-cayo-cream py-2.5 rounded-lg font-medium hover:bg-cayo-burgundy/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'מתחבר...' : 'התחברות'}
          </button>
        </form>
      </div>
    </div>
  )
}
