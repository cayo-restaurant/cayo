'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import cayoLogo from '../../cayo_brand_page_005.png'

type Status = 'pending' | 'confirmed' | 'cancelled'
type Area = 'bar' | 'table'

interface Reservation {
  id: string
  name: string
  date: string
  time: string
  area: Area
  guests: number
  phone: string
  email: string
  status: Status
  notes?: string
  createdAt: string
  updatedAt: string
}

const STATUS_LABEL: Record<Status, string> = {
  pending: 'ממתין',
  confirmed: 'מאושר',
  cancelled: 'בוטל',
}

const STATUS_STYLES: Record<Status, string> = {
  pending: 'bg-cayo-orange/15 text-cayo-orange border-cayo-orange/30',
  confirmed: 'bg-cayo-teal/15 text-cayo-teal border-cayo-teal/30',
  cancelled: 'bg-cayo-red/15 text-cayo-red border-cayo-red/30',
}

const AREA_LABEL: Record<Area, string> = {
  bar: 'בר',
  table: 'שולחן',
}

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function toDateString(d: Date) {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function humanDate(s: string) {
  const d = parseDate(s)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const key = toDateString(d)
  if (key === toDateString(today)) return `היום · יום ${HEBREW_DAYS[d.getDay()]}, ${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]}`
  if (key === toDateString(tomorrow)) return `מחר · יום ${HEBREW_DAYS[d.getDay()]}, ${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]}`
  if (key === toDateString(yesterday)) return `אתמול · יום ${HEBREW_DAYS[d.getDay()]}, ${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]}`
  return `יום ${HEBREW_DAYS[d.getDay()]}, ${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function shiftDate(s: string, days: number) {
  const d = parseDate(s)
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

// Reservation time slots: 19:00 → 22:30 in 15-min intervals (Israel local time)
function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = 19; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 30) break
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return slots
}

const TIME_SLOTS = generateTimeSlots()

// ───── Login screen ─────
function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'סיסמה שגויה')
      } else {
        onSuccess()
      }
    } catch {
      setError('שגיאה בחיבור')
    } finally {
      setLoading(false)
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
        <h1 className="text-2xl font-black text-cayo-burgundy text-center mb-2">איזור ניהול</h1>
        <p className="text-cayo-burgundy/50 text-center text-sm mb-8">הכניסו סיסמה להמשך</p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="סיסמה"
            className="w-full bg-white border-2 border-cayo-burgundy/20 rounded-xl px-4 py-3.5 text-cayo-burgundy font-bold text-center placeholder:text-cayo-burgundy/30 placeholder:font-bold focus:outline-none focus:border-cayo-burgundy transition-colors"
            autoFocus
          />
          {error && <p className="text-sm text-cayo-red text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-cayo-burgundy text-white font-black rounded-full hover:bg-cayo-burgundy/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ───── Reservation modal (add or edit) ─────
interface FormState {
  name: string
  date: string
  time: string
  area: Area
  guests: number
  phone: string
  email: string
  notes: string
  status: Status
}

function ReservationModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  initial: FormState & { id?: string }
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await fetch('/api/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, terms: true }),
        })
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || 'שגיאה ביצירה')
          return
        }
        // new reservation starts as pending; if admin chose a different status, patch it
        if (form.status !== 'pending') {
          const { id } = await res.json()
          await fetch(`/api/reservations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: form.status }),
          })
        }
      } else {
        const res = await fetch(`/api/reservations/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || 'שגיאה בשמירה')
          return
        }
      }
      onSaved()
    } catch {
      setError('שגיאה בחיבור')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border-2 border-cayo-burgundy/20 rounded-lg px-3 py-2 text-cayo-burgundy font-bold focus:outline-none focus:border-cayo-burgundy'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-black text-cayo-burgundy mb-5">
          {mode === 'create' ? 'הזמנה חדשה' : 'עריכת הזמנה'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">שם</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">תאריך</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">שעה</label>
              <select value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className={inputCls}>
                <option value="">בחרו שעה</option>
                {TIME_SLOTS.map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">אזור</label>
              <select value={form.area} onChange={e => setForm({ ...form, area: e.target.value as Area })} className={inputCls}>
                <option value="bar">בר</option>
                <option value="table">שולחן</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">סועדים</label>
              <input type="number" min={1} max={10} value={form.guests} onChange={e => setForm({ ...form, guests: Number(e.target.value) })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">טלפון</label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} placeholder="0501234567" />
          </div>
          <div>
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">אימייל</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">סטטוס</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })} className={inputCls}>
              <option value="pending">ממתין</option>
              <option value="confirmed">מאושר</option>
              <option value="cancelled">בוטל</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">הערות</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
          </div>
        </div>
        {error && <p className="text-sm text-cayo-red mt-3 text-center">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-3 bg-cayo-burgundy text-white font-black rounded-full hover:bg-cayo-burgundy/90 disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמירה'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 border-2 border-cayo-burgundy/30 text-cayo-burgundy font-black rounded-full hover:bg-cayo-burgundy/5"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

// ───── Dashboard ─────
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [items, setItems] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>(toDateString(new Date()))
  const [modal, setModal] = useState<
    | { mode: 'create'; initial: FormState }
    | { mode: 'edit'; initial: FormState & { id: string } }
    | null
  >(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/reservations', { cache: 'no-store' })
      if (res.status === 401) {
        onLogout()
        return
      }
      const data = await res.json()
      setItems(data.reservations || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function changeStatus(id: string, status: Status) {
    await fetch(`/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm('למחוק את ההזמנה לצמיתות?')) return
    await fetch(`/api/reservations/${id}`, { method: 'DELETE' })
    load()
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    onLogout()
  }

  // Reservations for selected day, sorted by time
  const dayItems = useMemo(
    () =>
      items
        .filter(r => r.date === selectedDate)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [items, selectedDate]
  )

  const dayTotals = useMemo(() => {
    const active = dayItems.filter(r => r.status !== 'cancelled')
    return {
      reservations: active.length,
      guests: active.reduce((sum, r) => sum + r.guests, 0),
      pending: dayItems.filter(r => r.status === 'pending').length,
      confirmed: dayItems.filter(r => r.status === 'confirmed').length,
      cancelled: dayItems.filter(r => r.status === 'cancelled').length,
    }
  }, [dayItems])

  function openCreate() {
    setModal({
      mode: 'create',
      initial: {
        name: '',
        date: selectedDate,
        time: '20:00',
        area: 'table',
        guests: 2,
        phone: '',
        email: '',
        notes: '',
        status: 'confirmed',
      },
    })
  }

  function openEdit(r: Reservation) {
    setModal({
      mode: 'edit',
      initial: {
        id: r.id,
        name: r.name || '',
        date: r.date,
        time: r.time,
        area: r.area,
        guests: r.guests,
        phone: r.phone,
        email: r.email,
        notes: r.notes || '',
        status: r.status,
      },
    })
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b-2 border-cayo-burgundy/10 bg-white sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="block">
              <div className="w-[70px] overflow-hidden">
                <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
              </div>
            </Link>
            <div>
              <h1 className="text-lg font-black text-cayo-burgundy">איזור ניהול</h1>
              <p className="text-xs text-cayo-burgundy/50">ניהול הזמנות לפי יום</p>
            </div>
          </div>
          <button onClick={logout} className="text-sm font-bold text-cayo-burgundy/70 hover:text-cayo-burgundy">
            יציאה
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Day navigator */}
        <div className="bg-cayo-burgundy text-white rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-xl font-black"
              aria-label="יום קודם"
            >
              ‹
            </button>
            <div className="flex-1 text-center">
              <p className="text-xl sm:text-2xl font-black">{humanDate(selectedDate)}</p>
            </div>
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-xl font-black"
              aria-label="יום הבא"
            >
              ›
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedDate(toDateString(new Date()))}
                className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
              >
                היום
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer [color-scheme:dark]"
              />
            </div>
            <div className="flex gap-4 text-xs font-bold flex-wrap">
              <span>
                <span className="opacity-60">הזמנות פעילות:</span> {dayTotals.reservations}
              </span>
              <span>
                <span className="opacity-60">סועדים:</span> {dayTotals.guests}
              </span>
              <span className="opacity-60">·</span>
              <span>ממתין: {dayTotals.pending}</span>
              <span>מאושר: {dayTotals.confirmed}</span>
              <span>בוטל: {dayTotals.cancelled}</span>
            </div>
          </div>
        </div>

        {/* Add reservation */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-bold text-cayo-burgundy/70">
            {dayItems.length === 0 ? 'אין הזמנות ליום זה' : `${dayItems.length} הזמנות`}
          </h2>
          <button
            onClick={openCreate}
            className="text-sm font-black px-4 py-2 rounded-full bg-cayo-burgundy text-white hover:bg-cayo-burgundy/90 transition-colors flex items-center gap-1.5"
          >
            <span className="text-lg leading-none">+</span>
            הוספת הזמנה
          </button>
        </div>

        {/* Reservations list */}
        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-16 font-bold">טוען...</p>
        ) : dayItems.length === 0 ? (
          <button
            onClick={openCreate}
            className="block w-full py-16 border-2 border-dashed border-cayo-burgundy/20 rounded-2xl text-cayo-burgundy/40 hover:border-cayo-burgundy/50 hover:text-cayo-burgundy/70 transition-colors font-bold"
          >
            + הוספת הזמנה ראשונה ליום זה
          </button>
        ) : (
          <div className="space-y-2">
            {dayItems.map(r => (
              <div
                key={r.id}
                className={`border-2 rounded-xl p-4 transition-colors ${
                  r.status === 'cancelled'
                    ? 'border-cayo-red/20 bg-cayo-red/5 opacity-60'
                    : 'border-cayo-burgundy/15 hover:border-cayo-burgundy/30'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Time badge */}
                  <div className="bg-cayo-burgundy/10 rounded-lg px-3 py-2 text-center min-w-[70px]">
                    <p className="text-xl font-black text-cayo-burgundy leading-none" dir="ltr">{r.time}</p>
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-lg font-black text-cayo-burgundy truncate">
                        {r.name || '— ללא שם —'}
                      </p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                    <div className="text-sm text-cayo-burgundy/70 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="font-bold">
                        {r.guests} {r.guests === 1 ? 'סועד' : 'סועדים'}
                      </span>
                      <span className="font-bold">· {AREA_LABEL[r.area]}</span>
                      <span dir="ltr">· {r.phone}</span>
                      {r.email && <span className="truncate">· {r.email}</span>}
                    </div>
                    {r.notes && (
                      <p className="text-xs text-cayo-burgundy/60 mt-1.5 italic">הערה: {r.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {r.status !== 'confirmed' && (
                      <button
                        onClick={() => changeStatus(r.id, 'confirmed')}
                        className="text-xs font-bold px-3 py-1 rounded-full bg-cayo-teal text-white hover:bg-cayo-teal/90"
                        title="אישור"
                      >
                        אישור
                      </button>
                    )}
                    {r.status !== 'cancelled' && (
                      <button
                        onClick={() => changeStatus(r.id, 'cancelled')}
                        className="text-xs font-bold px-3 py-1 rounded-full bg-cayo-red text-white hover:bg-cayo-red/90"
                        title="ביטול"
                      >
                        ביטול
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(r)}
                      className="text-xs font-bold px-3 py-1 rounded-full border-2 border-cayo-burgundy/30 text-cayo-burgundy hover:border-cayo-burgundy"
                    >
                      עריכה
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="text-xs font-bold px-3 py-1 rounded-full text-cayo-burgundy/50 hover:text-cayo-red"
                    >
                      מחיקה
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modal && (
        <ReservationModal
          mode={modal.mode}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            load()
          }}
        />
      )}
    </div>
  )
}

// ───── Root ─────
export default function AdminPage() {
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading')

  useEffect(() => {
    fetch('/api/admin/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setAuth(d.authenticated ? 'in' : 'out'))
      .catch(() => setAuth('out'))
  }, [])

  if (auth === 'loading') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-cayo-burgundy/50 font-bold">טוען...</p>
      </div>
    )
  }

  if (auth === 'out') {
    return <LoginScreen onSuccess={() => setAuth('in')} />
  }

  return <Dashboard onLogout={() => setAuth('out')} />
}
