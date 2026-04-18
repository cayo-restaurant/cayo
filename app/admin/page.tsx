'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signIn, signOut } from 'next-auth/react'
import cayoLogo from '../../cayo_brand_page_005.png'
import TablePickerModal from './components/TablePickerModal'

type Status = 'pending' | 'confirmed' | 'cancelled' | 'arrived' | 'no_show' | 'completed'
type Area = 'bar' | 'table'

// Mirror of AssignedTable in lib/assignments-store.ts — duplicated here so the
// client bundle doesn't pull in the server-only supabase service client.
interface AssignedTable {
  id: string
  tableNumber: number
  label: string | null
  area: Area
  capacityMin: number
  capacityMax: number
  isPrimary: boolean
}

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
  tables: AssignedTable[]
}

const STATUS_LABEL: Record<Status, string> = {
  pending: 'ממתין',
  confirmed: 'מאושר',
  cancelled: 'בוטל',
  arrived: 'הגיעו',
  no_show: 'לא הגיעו',
  completed: 'הסתיים',
}

const STATUS_STYLES: Record<Status, string> = {
  pending: 'bg-cayo-orange/15 text-cayo-orange border-cayo-orange/30',
  confirmed: 'bg-cayo-teal/15 text-cayo-teal border-cayo-teal/30',
  cancelled: 'bg-cayo-red/15 text-cayo-red border-cayo-red/30',
  arrived: 'bg-cayo-burgundy/15 text-cayo-burgundy border-cayo-burgundy/30',
  no_show: 'bg-black/10 text-black/70 border-black/20',
  completed: 'bg-cayo-teal/10 text-cayo-teal/70 border-cayo-teal/20',
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

// Returns the 7 dates of the week (Sunday → Saturday) containing the given date
function weekOf(s: string): string[] {
  const d = parseDate(s)
  const dow = d.getDay() // 0 = Sunday
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - dow)
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const x = new Date(sunday)
    x.setDate(sunday.getDate() + i)
    out.push(toDateString(x))
  }
  return out
}

const HEBREW_DAYS_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

// Reservation time slots: 19:00 → 22:00 in 15-min intervals (Israel local time)
function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = 19; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 0) break
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return slots
}

const TIME_SLOTS = generateTimeSlots()

// Convert Israeli local phone (05XXXXXXXX) to international for WhatsApp deep link
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  return digits
}

// Time-badge colors per status
const TIME_BADGE_STYLES: Record<Status, string> = {
  pending: 'bg-cayo-orange/15 text-cayo-orange',
  confirmed: 'bg-cayo-teal/15 text-cayo-teal',
  cancelled: 'bg-cayo-red/15 text-cayo-red',
  arrived: 'bg-cayo-burgundy/15 text-cayo-burgundy',
  no_show: 'bg-black/10 text-black/70',
  completed: 'bg-cayo-teal/10 text-cayo-teal/70',
}

// Build a pre-filled WhatsApp confirmation message matching the reservation
function buildWhatsAppConfirmation(r: {
  name: string
  date: string
  time: string
  guests: number
  area: Area
}): string {
  const lines = [
    `שלום ${r.name || ''}! ✨`,
    `ההזמנה שלך ב-CAYO אושרה:`,
    `📅 ${humanDate(r.date)}`,
    `⏰ ${r.time}`,
    `👥 ${r.guests} ${r.guests === 1 ? 'סועד' : 'סועדים'} · ${AREA_LABEL[r.area]}`,
    ``,
    `מצפים לראותך!`,
  ]
  return lines.join('\n')
}

// Phone normalizer for matching returning customers (strips non-digits)
function normalizePhone(phone: string): string {
  return (phone || '').replace(/\D/g, '')
}

// ───── Login screen (Google OAuth) ─────
function LoginScreen({ errorParam }: { errorParam?: string | null }) {
  const rejected = errorParam === 'AccessDenied'
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <Link href="/" className="block mb-10">
          <div className="w-[160px] mx-auto overflow-hidden">
            <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
          </div>
        </Link>
        <h1 className="text-2xl font-black text-cayo-burgundy text-center mb-2">איזור ניהול</h1>
        <p className="text-cayo-burgundy/50 text-center text-sm mb-8">כניסה עם חשבון Google מורשה בלבד</p>
        {rejected && (
          <div className="mb-5 rounded-xl border-2 border-cayo-red/30 bg-cayo-red/5 px-4 py-3 text-sm text-cayo-red text-center font-bold">
            החשבון שבחרת לא מורשה לגשת לניהול.
          </div>
        )}
        <button
          onClick={() => signIn('google', { callbackUrl: '/admin' })}
          className="w-full py-3.5 bg-white border-2 border-cayo-burgundy/20 rounded-full text-cayo-burgundy font-black hover:border-cayo-burgundy transition-colors flex items-center justify-center gap-3"
        >
          {/* Google G logo */}
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>כניסה עם Google</span>
        </button>
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
  initial: FormState & { id?: string; updatedAt?: string }
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
        // Optimistic lock: include the updatedAt we loaded with so the server
        // rejects the save (409) if anyone else (e.g. the hostess) modified
        // the row in between. On 409 we trigger a refresh so the user sees
        // the conflicting change and can retry.
        const res = await fetch(`/api/reservations/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, expectedUpdatedAt: initial.updatedAt }),
        })
        if (!res.ok) {
          const data = await res.json()
          if (res.status === 409) {
            setError(data.error || 'ההזמנה שונתה במקביל. הרשימה תרוענן — נסה שוב.')
            // Refresh the parent list so the user sees the latest state
            onSaved()
          } else {
            setError(data.error || 'שגיאה בשמירה')
          }
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
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">שם <span className="font-normal opacity-60">(אופציונלי)</span></label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="אורח/ת" />
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
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">טלפון <span className="font-normal opacity-60">(אופציונלי)</span></label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} placeholder="0501234567" />
          </div>
          <div>
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">אימייל <span className="font-normal opacity-60">(אופציונלי)</span></label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-cayo-burgundy/60 mb-1">סטטוס</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })} className={inputCls}>
              <option value="pending">ממתין</option>
              <option value="confirmed">מאושר</option>
              <option value="cancelled">בוטל</option>
              <option value="arrived">הגיעו</option>
              <option value="no_show">לא הגיעו</option>
              <option value="completed">הסתיים</option>
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
interface TodayShift {
  id: string
  employee_id: string
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  employees: { full_name: string; role: string; hourly_rate: number } | null
}

const ROLE_LABEL_DASH: Record<string, string> = {
  manager: 'אחמ"ש',
  bartender: 'בר',
  waiter: 'מלצרים',
  host: 'מארחת',
  kitchen: 'מטבח',
  dishwasher: 'שטיפה',
}

function Dashboard() {
  const [items, setItems] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>(toDateString(new Date()))
  // `now` state ticks every 30s so the "חדש" pill auto-expires at the 30-min mark
  const [now, setNow] = useState(() => Date.now())
  const [searchQuery, setSearchQuery] = useState('')
  // Simplified filter: 'all' | 'approved' (confirmed + arrived) | 'not_approved' (pending + cancelled + no_show)
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'not_approved'>('all')
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Reservation | null>(null)
  const [modal, setModal] = useState<
    | { mode: 'create'; initial: FormState }
    | { mode: 'edit'; initial: FormState & { id: string; updatedAt: string } }
    | null
  >(null)
  // Reservation whose table assignment the hostess is currently editing.
  // `null` = modal closed. Opened by clicking the assignment row/🪑 button on any card.
  const [pickerFor, setPickerFor] = useState<Reservation | null>(null)

  // Today overview — shifts
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>([])

  async function loadTodayShifts() {
    const today = toDateString(new Date())
    const month = today.slice(0, 7)
    const res = await fetch(`/api/shifts?month=${month}`)
    if (res.ok) {
      const all: TodayShift[] = await res.json()
      setTodayShifts(all.filter(s => s.date === today))
    }
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/reservations', { cache: 'no-store' })
      if (res.status === 401) {
        await signOut({ callbackUrl: '/admin' })
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
    loadTodayShifts()
  }, [])

  // Tick `now` every 30 seconds so the "חדש" badge expires on time without reloads
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Refresh reservations every 60s so the admin view doesn't drift from
  // hostess-side updates (status changes during service). Skip refresh while
  // a modal is open so we don't blow away an in-progress edit.
  useEffect(() => {
    const id = setInterval(() => {
      if (modal === null && deleteConfirm === null && pickerFor === null) load()
    }, 60_000)
    return () => clearInterval(id)
  }, [modal, deleteConfirm, pickerFor])

  async function changeStatus(id: string, status: Status) {
    await fetch(`/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    await fetch(`/api/reservations/${deleteConfirm.id}`, { method: 'DELETE' })
    setDeleteConfirm(null)
    load()
  }

  async function logout() {
    await signOut({ callbackUrl: '/admin' })
  }

  // Reservations for selected day, filtered by search + status, sorted by time
  const dayItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return items
      .filter(r => r.date === selectedDate)
      .filter(r => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'approved') return r.status === 'confirmed' || r.status === 'arrived'
        // not_approved
        return r.status === 'pending' || r.status === 'cancelled' || r.status === 'no_show'
      })
      .filter(r => {
        if (!q) return true
        return (
          r.name?.toLowerCase().includes(q) ||
          r.phone?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.time.localeCompare(b.time))
  }, [items, selectedDate, searchQuery, statusFilter])

  // Totals are computed from the full day (ignore search + status filters)
  const dayAll = useMemo(
    () => items.filter(r => r.date === selectedDate),
    [items, selectedDate]
  )

  const dayTotals = useMemo(() => {
    const active = dayAll.filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
    return {
      reservations: active.length,
      guests: active.reduce((sum, r) => sum + r.guests, 0),
      pending: dayAll.filter(r => r.status === 'pending').length,
      confirmed: dayAll.filter(r => r.status === 'confirmed').length,
      cancelled: dayAll.filter(r => r.status === 'cancelled').length,
      arrived: dayAll.filter(r => r.status === 'arrived').length,
      no_show: dayAll.filter(r => r.status === 'no_show').length,
    }
  }, [dayAll])

  // Density sparkline data — guests-occupancy per time slot for the selected
  // day. A reservation at 19:00 with the standard 120-min duration occupies
  // 19:00, 19:15, 19:30, 19:45, 20:00, 20:15, 20:30, 20:45.
  // Cancelled / no-show don't count.
  const densityByTime = useMemo(() => {
    const SLOTS = TIME_SLOTS // 19:00 → 21:30 every 15min
    const DURATION_MIN = 120
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    const active = dayAll.filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
    return SLOTS.map(slot => {
      const slotMin = toMin(slot)
      let guests = 0
      for (const r of active) {
        const start = toMin(r.time)
        if (slotMin >= start && slotMin < start + DURATION_MIN) guests += r.guests
      }
      return { time: slot, guests }
    })
  }, [dayAll])

  const peakSlot = useMemo(() => {
    return densityByTime.reduce(
      (best, x) => (x.guests > best.guests ? x : best),
      { time: '', guests: 0 }
    )
  }, [densityByTime])

  // Returning-customer counts: map normalized phone → # of reservations by that phone
  // (excluding cancelled / no-show, since those didn't actually "come").
  // Used to show "חוזר ×N" pill on a reservation card.
  const returningCountByPhone = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of items) {
      if (r.status === 'cancelled' || r.status === 'no_show') continue
      const key = normalizePhone(r.phone)
      if (!key) continue
      map.set(key, (map.get(key) || 0) + 1)
    }
    return map
  }, [items])

  // Monthly statistics — for the current calendar month of selectedDate
  const monthStats = useMemo(() => {
    const base = parseDate(selectedDate)
    const y = base.getFullYear()
    const m = base.getMonth()
    const monthItems = items.filter(r => {
      const d = parseDate(r.date)
      return d.getFullYear() === y && d.getMonth() === m
    })
    const active = monthItems.filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
    const arrived = monthItems.filter(r => r.status === 'arrived').length
    const no_show = monthItems.filter(r => r.status === 'no_show').length
    const decided = arrived + no_show
    const noShowRate = decided > 0 ? Math.round((no_show / decided) * 100) : 0

    // Busiest date within the month (by count of active reservations)
    const byDate = new Map<string, number>()
    for (const r of active) byDate.set(r.date, (byDate.get(r.date) || 0) + 1)
    let busiestDate: string | null = null
    let busiestCount = 0
    for (const [d, c] of byDate) {
      if (c > busiestCount) {
        busiestCount = c
        busiestDate = d
      }
    }

    return {
      monthLabel: HEBREW_MONTHS[m],
      reservations: active.length,
      guests: active.reduce((sum, r) => sum + r.guests, 0),
      arrived,
      no_show,
      noShowRate,
      busiestDate,
      busiestCount,
    }
  }, [items, selectedDate])

  // Week strip: 7-day overview (Sunday → Saturday) around selectedDate
  const weekDays = useMemo(() => {
    const today = toDateString(new Date())
    return weekOf(selectedDate).map(date => {
      const dayItemsAll = items.filter(r => r.date === date)
      const active = dayItemsAll.filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
      const d = parseDate(date)
      return {
        date,
        isToday: date === today,
        isSelected: date === selectedDate,
        dayShort: HEBREW_DAYS_SHORT[d.getDay()],
        dayNum: d.getDate(),
        count: active.length,
        hasPending: dayItemsAll.some(r => r.status === 'pending'),
      }
    })
  }, [items, selectedDate])

  // A reservation is "new" if created within the last 30 minutes
  function isNew(r: Reservation): boolean {
    if (!r.createdAt) return false
    const created = new Date(r.createdAt).getTime()
    if (Number.isNaN(created)) return false
    return now - created < 30 * 60 * 1000
  }

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
        updatedAt: r.updatedAt,
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

  // Renders a single reservation row. Extracted so we can render two parallel
  // columns (bar / tables) using the same row markup.
  const renderRow = (r: Reservation) => (
    <div
      key={r.id}
      className={`border-2 rounded-xl p-4 transition-colors ${
        r.status === 'cancelled'
          ? 'border-cayo-red/20 bg-cayo-red/5 opacity-60'
          : r.status === 'no_show'
          ? 'border-black/15 bg-black/5 opacity-70'
          : r.status === 'completed'
          ? 'border-cayo-teal/20 bg-cayo-teal/5 opacity-75'
          : r.status === 'arrived'
          ? 'border-cayo-burgundy/30 bg-cayo-burgundy/5'
          : 'border-cayo-burgundy/15 hover:border-cayo-burgundy/30'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Time badge — colored by status */}
        <div className={`rounded-lg px-3 py-2 text-center min-w-[70px] ${TIME_BADGE_STYLES[r.status]}`}>
          <p className="text-xl font-black leading-none" dir="ltr">{r.time}</p>
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
            {isNew(r) && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cayo-burgundy text-white uppercase tracking-wide">
                חדש
              </span>
            )}
            {(() => {
              const count = returningCountByPhone.get(normalizePhone(r.phone)) || 0
              if (count < 2) return null
              return (
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cayo-teal/15 text-cayo-teal"
                  title={`הזמנות היסטוריות: ${count}`}
                >
                  חוזר ×{count}
                </span>
              )
            })()}
          </div>
          <div className="text-sm text-cayo-burgundy/70 flex flex-wrap gap-x-3 gap-y-1 items-center">
            <span className="font-bold">
              {r.guests} {r.guests === 1 ? 'סועד' : 'סועדים'}
            </span>
            {r.phone && (
              <>
                <span className="opacity-50">·</span>
                <a
                  href={`tel:${r.phone}`}
                  dir="ltr"
                  className="font-bold hover:text-cayo-burgundy hover:underline"
                >
                  {r.phone}
                </a>
                <a
                  href={`https://wa.me/${toWhatsAppNumber(r.phone)}?text=${encodeURIComponent(buildWhatsAppConfirmation(r))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#25D366] text-white hover:opacity-90"
                  title="שלח אישור ב-WhatsApp"
                  aria-label="WhatsApp"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
                    <path d="M20.52 3.48A11.9 11.9 0 0 0 12.02 0C5.4 0 .04 5.36.04 11.98c0 2.11.55 4.17 1.6 5.98L0 24l6.22-1.63a11.94 11.94 0 0 0 5.8 1.48h.01c6.62 0 11.98-5.36 11.98-11.98 0-3.2-1.25-6.2-3.49-8.39zM12.03 21.3h-.01a9.3 9.3 0 0 1-4.73-1.3l-.34-.2-3.69.97.99-3.6-.22-.37a9.28 9.28 0 0 1-1.42-4.92c0-5.14 4.19-9.32 9.33-9.32 2.5 0 4.84.97 6.6 2.74a9.24 9.24 0 0 1 2.73 6.6c0 5.14-4.19 9.4-9.24 9.4zm5.37-6.96c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.66-1.58-.9-2.17-.24-.57-.48-.49-.66-.5H8.1c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.11 3.22 5.1 4.51.71.31 1.27.49 1.7.63.72.23 1.37.2 1.89.12.58-.09 1.75-.71 2-1.4.25-.69.25-1.28.17-1.4-.07-.12-.27-.2-.56-.34z"/>
                  </svg>
                </a>
              </>
            )}
            {r.email && (
              <>
                <span className="opacity-50">·</span>
                <a
                  href={`mailto:${r.email}`}
                  className="truncate hover:text-cayo-burgundy hover:underline"
                >
                  {r.email}
                </a>
              </>
            )}
          </div>
          {r.notes && (
            <p className="text-xs text-cayo-burgundy/60 mt-1.5 italic">הערה: {r.notes}</p>
          )}

          {/* Physical-table assignment row.
              Hidden for cancelled / no_show / completed — no point assigning a
              table to a reservation that's already resolved. */}
          {r.status !== 'cancelled' && r.status !== 'no_show' && r.status !== 'completed' && (
            <div className="mt-2">
              {r.tables.length > 0 ? (
                <button
                  onClick={() => setPickerFor(r)}
                  className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full bg-cayo-burgundy/10 text-cayo-burgundy hover:bg-cayo-burgundy/20 transition-colors"
                  title="שינוי שיוך שולחן"
                >
                  <span>🪑</span>
                  <span>
                    שולחן {r.tables.find(t => t.isPrimary)?.tableNumber ?? r.tables[0].tableNumber}
                    {r.tables.length > 1 && (
                      <span className="font-bold opacity-70"> +{r.tables.length - 1}</span>
                    )}
                  </span>
                  <span className="opacity-50">·</span>
                  <span className="text-[10px] font-bold opacity-80">עריכה</span>
                </button>
              ) : (
                <button
                  onClick={() => setPickerFor(r)}
                  className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full bg-cayo-orange/15 text-cayo-orange hover:bg-cayo-orange/25 transition-colors"
                  title="שיוך שולחן"
                >
                  <span>⚠</span>
                  <span>ללא שולחן</span>
                  <span className="opacity-50">·</span>
                  <span>שייך</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Primary actions + overflow menu */}
        <div className="flex items-start gap-1.5 shrink-0">
          <div className="flex flex-col gap-1.5">
            {r.status === 'pending' && (
              <>
                <button
                  onClick={() => changeStatus(r.id, 'confirmed')}
                  className="text-xs font-bold px-3 py-1 rounded-full bg-cayo-teal text-white hover:bg-cayo-teal/90"
                >
                  אישור
                </button>
                <button
                  onClick={() => changeStatus(r.id, 'cancelled')}
                  className="text-xs font-bold px-3 py-1 rounded-full bg-cayo-red text-white hover:bg-cayo-red/90"
                >
                  ביטול
                </button>
              </>
            )}
            {r.status === 'confirmed' && r.date <= toDateString(new Date()) && (
              <>
                <button
                  onClick={() => changeStatus(r.id, 'arrived')}
                  className="text-xs font-bold px-3 py-1 rounded-full bg-cayo-burgundy text-white hover:bg-cayo-burgundy/90"
                >
                  הגיעו
                </button>
                <button
                  onClick={() => changeStatus(r.id, 'no_show')}
                  className="text-xs font-bold px-3 py-1 rounded-full bg-black/60 text-white hover:bg-black/70"
                >
                  לא הגיעו
                </button>
              </>
            )}
            {r.status === 'confirmed' && r.date > toDateString(new Date()) && (
              <button
                onClick={() => changeStatus(r.id, 'cancelled')}
                className="text-xs font-bold px-3 py-1 rounded-full bg-cayo-red text-white hover:bg-cayo-red/90"
              >
                ביטול
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpenFor(menuOpenFor === r.id ? null : r.id)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-cayo-burgundy/60 hover:text-cayo-burgundy hover:bg-cayo-burgundy/5 text-xl font-black leading-none"
              aria-label="אפשרויות נוספות"
            >
              ⋯
            </button>
            {menuOpenFor === r.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpenFor(null)} />
                <div className="absolute left-0 mt-1 w-36 bg-white border-2 border-cayo-burgundy/15 rounded-xl shadow-lg py-1 z-20">
                  <button
                    onClick={() => { setMenuOpenFor(null); openEdit(r) }}
                    className="w-full text-right px-4 py-2 text-sm font-bold text-cayo-burgundy hover:bg-cayo-burgundy/5"
                  >
                    עריכה
                  </button>
                  {(r.status === 'cancelled' || r.status === 'arrived' || r.status === 'no_show' || r.status === 'completed') && (
                    <button
                      onClick={() => { setMenuOpenFor(null); changeStatus(r.id, 'confirmed') }}
                      className="w-full text-right px-4 py-2 text-sm font-bold text-cayo-burgundy hover:bg-cayo-burgundy/5"
                    >
                      שחזור ל&quot;מאושר&quot;
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpenFor(null); setDeleteConfirm(r) }}
                    className="w-full text-right px-4 py-2 text-sm font-bold text-cayo-red hover:bg-cayo-red/5"
                  >
                    מחיקה
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // Today overview computed
  const todayOverview = useMemo(() => {
    const today = toDateString(new Date())
    const todayRes = items.filter(r => r.date === today)
    const activeRes = todayRes.filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
    const pendingRes = todayRes.filter(r => r.status === 'pending').length
    const confirmedRes = todayRes.filter(r => r.status === 'confirmed').length
    const arrivedRes = todayRes.filter(r => r.status === 'arrived').length

    // Group shifts by role
    const byRole: Record<string, string[]> = {}
    for (const s of todayShifts) {
      const role = s.employees?.role || 'unknown'
      if (!byRole[role]) byRole[role] = []
      byRole[role].push(s.employees?.full_name || '?')
    }

    return {
      totalWorkers: todayShifts.length,
      byRole,
      totalReservations: activeRes.length,
      totalGuests: activeRes.reduce((sum, r) => sum + r.guests, 0),
      pendingRes,
      confirmedRes,
      arrivedRes,
    }
  }, [items, todayShifts])

  // Split for two-column layout (bar / tables). Already filtered + sorted.
  const barItems = dayItems.filter(r => r.area === 'bar')
  const tableItems = dayItems.filter(r => r.area === 'table')

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
          <div className="flex items-center gap-4">
            <Link
              href="/host"
              className="text-sm font-bold text-cayo-teal hover:text-cayo-burgundy transition-colors"
              title="מעבר למצב משמרת"
            >
              מצב משמרת ←
            </Link>
            <button onClick={logout} className="text-sm font-bold text-cayo-burgundy/70 hover:text-cayo-burgundy">
              יציאה
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* ===== TODAY OVERVIEW ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Workers tonight */}
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-cayo-burgundy/60 uppercase tracking-wider">צוות הערב</h3>
              <span className="text-2xl font-black text-cayo-burgundy">{todayOverview.totalWorkers}</span>
            </div>
            {todayOverview.totalWorkers === 0 ? (
              <p className="text-xs text-cayo-burgundy/30">לא שובצו עובדים להיום</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(todayOverview.byRole).map(([role, names]) => (
                  <span key={role} className="text-[11px] font-bold bg-cayo-burgundy/8 text-cayo-burgundy/70 px-2 py-0.5 rounded-full">
                    {ROLE_LABEL_DASH[role] || role} {names.length}
                  </span>
                ))}
              </div>
            )}
            <Link href="/admin/hours" className="block mt-3 text-xs font-bold text-cayo-burgundy hover:underline">
              סידור עבודה ←
            </Link>
          </div>

          {/* Reservations tonight */}
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-cayo-burgundy/60 uppercase tracking-wider">הזמנות הערב</h3>
              <span className="text-2xl font-black text-cayo-burgundy">{todayOverview.totalReservations}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {todayOverview.pendingRes > 0 && (
                <span className="text-[11px] font-bold bg-cayo-orange/15 text-cayo-orange px-2 py-0.5 rounded-full">
                  ממתין {todayOverview.pendingRes}
                </span>
              )}
              {todayOverview.confirmedRes > 0 && (
                <span className="text-[11px] font-bold bg-cayo-teal/15 text-cayo-teal px-2 py-0.5 rounded-full">
                  מאושר {todayOverview.confirmedRes}
                </span>
              )}
              {todayOverview.arrivedRes > 0 && (
                <span className="text-[11px] font-bold bg-cayo-burgundy/15 text-cayo-burgundy px-2 py-0.5 rounded-full">
                  הגיעו {todayOverview.arrivedRes}
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-cayo-burgundy/50">
              <span className="font-bold text-cayo-burgundy">{todayOverview.totalGuests}</span> סועדים צפויים
            </p>
          </div>

          {/* Quick actions */}
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-2xl p-4 flex flex-col justify-between">
            <h3 className="text-xs font-black text-cayo-burgundy/60 uppercase tracking-wider mb-3">פעולות מהירות</h3>
            <div className="flex flex-col gap-2">
              <Link
                href="/admin/hours"
                className="text-center text-xs font-bold py-2 px-3 rounded-lg bg-cayo-burgundy/8 text-cayo-burgundy hover:bg-cayo-burgundy/15 transition-colors"
              >
                חישוב טיפים
              </Link>
              <Link
                href="/admin/employees"
                className="text-center text-xs font-bold py-2 px-3 rounded-lg bg-cayo-burgundy/8 text-cayo-burgundy hover:bg-cayo-burgundy/15 transition-colors"
              >
                ניהול עובדים
              </Link>
              <Link
                href="/admin/map"
                className="text-center text-xs font-bold py-2 px-3 rounded-lg bg-cayo-burgundy/8 text-cayo-burgundy hover:bg-cayo-burgundy/15 transition-colors"
              >
                מפת מסעדה
              </Link>
              <button
                onClick={openCreate}
                className="text-xs font-bold py-2 px-3 rounded-lg bg-cayo-burgundy text-white hover:bg-cayo-burgundy/90 transition-colors"
              >
                + הזמנה חדשה
              </button>
            </div>
          </div>
        </div>

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

          {/* Week strip — Sunday → Saturday, click to jump to that day */}
          <div className="grid grid-cols-7 gap-1.5 mb-4" dir="rtl">
            {weekDays.map(w => (
              <button
                key={w.date}
                onClick={() => setSelectedDate(w.date)}
                className={`relative rounded-lg py-2 px-1 text-center transition-colors ${
                  w.isSelected
                    ? 'bg-white text-cayo-burgundy'
                    : w.isToday
                    ? 'bg-white/20 text-white hover:bg-white/30'
                    : 'bg-white/5 text-white/85 hover:bg-white/15'
                }`}
                aria-label={`${w.dayShort} ${w.dayNum}${w.count ? ` — ${w.count} הזמנות` : ''}`}
              >
                <p className={`text-[10px] font-bold leading-none mb-1 ${w.isSelected ? 'text-cayo-burgundy/60' : 'opacity-60'}`}>
                  {w.dayShort}
                </p>
                <p className="text-base font-black leading-none">{w.dayNum}</p>
                <p className={`text-[10px] font-bold leading-none mt-1 ${
                  w.count === 0 ? 'opacity-0' : w.isSelected ? 'text-cayo-burgundy/70' : 'opacity-70'
                }`}>
                  {w.count || '·'}
                </p>
                {w.hasPending && (
                  <span
                    className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-cayo-orange"
                    aria-label="יש הזמנות ממתינות"
                  />
                )}
              </button>
            ))}
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
            <div className="flex gap-3 text-xs font-bold flex-wrap">
              <span>
                <span className="opacity-60">הזמנות פעילות:</span> {dayTotals.reservations}
              </span>
              <span>
                <span className="opacity-60">סועדים:</span> {dayTotals.guests}
              </span>
            </div>
          </div>
        </div>

        {/* Density sparkline — guest occupancy across the evening 19:00→21:30 */}
        <div className="mb-6 bg-white border-2 border-cayo-burgundy/15 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black text-cayo-burgundy/70 uppercase tracking-wider">
              צפיפות לאורך הערב
            </h3>
            {peakSlot.guests > 0 ? (
              <p className="text-xs font-bold text-cayo-burgundy/60">
                שיא: <span dir="ltr" className="text-cayo-burgundy">{peakSlot.time}</span>
                {' · '}
                <span className="text-cayo-burgundy">{peakSlot.guests}</span> סועדים
              </p>
            ) : (
              <p className="text-xs font-bold text-cayo-burgundy/30">אין הזמנות פעילות</p>
            )}
          </div>
          {(() => {
            const max = Math.max(peakSlot.guests, 1)
            return (
              <div className="flex items-end gap-1 h-20" dir="ltr">
                {densityByTime.map(d => {
                  const pct = (d.guests / max) * 100
                  const isPeak = d.guests === peakSlot.guests && d.guests > 0
                  const isHourMark = d.time.endsWith(':00')
                  return (
                    <div
                      key={d.time}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative"
                      title={`${d.time} — ${d.guests} סועדים`}
                    >
                      <span className="text-[9px] font-bold text-cayo-burgundy/40 mb-0.5 leading-none">
                        {d.guests > 0 ? d.guests : ''}
                      </span>
                      <div
                        className={`w-full rounded-t transition-colors ${
                          d.guests === 0
                            ? 'bg-cayo-burgundy/5 min-h-[2px]'
                            : isPeak
                            ? 'bg-cayo-burgundy'
                            : 'bg-cayo-teal/70'
                        }`}
                        style={{ height: d.guests === 0 ? '2px' : `${Math.max(pct, 8)}%` }}
                      />
                      <span
                        className={`text-[9px] mt-1 leading-none ${
                          isHourMark ? 'font-black text-cayo-burgundy/70' : 'font-bold text-cayo-burgundy/30'
                        }`}
                      >
                        {isHourMark ? d.time : '·'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {/* Monthly stats — aggregates for the calendar month of selectedDate */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
              {monthStats.monthLabel} · הזמנות
            </p>
            <p className="text-xl font-black text-cayo-burgundy mt-0.5">{monthStats.reservations}</p>
          </div>
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
              סה"כ סועדים
            </p>
            <p className="text-xl font-black text-cayo-burgundy mt-0.5">{monthStats.guests}</p>
          </div>
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
              אחוז no-show
            </p>
            <p className="text-xl font-black text-cayo-burgundy mt-0.5">
              {monthStats.arrived + monthStats.no_show === 0
                ? <span className="text-cayo-burgundy/30">—</span>
                : `${monthStats.noShowRate}%`}
            </p>
          </div>
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
              יום הכי עמוס
            </p>
            {monthStats.busiestDate ? (
              <button
                onClick={() => setSelectedDate(monthStats.busiestDate!)}
                className="text-sm font-black text-cayo-burgundy mt-0.5 hover:underline block text-right"
                title="מעבר ליום"
              >
                {parseDate(monthStats.busiestDate).getDate()} {HEBREW_MONTHS[parseDate(monthStats.busiestDate).getMonth()]}
                <span className="text-cayo-burgundy/50 font-bold"> · {monthStats.busiestCount}</span>
              </button>
            ) : (
              <p className="text-sm font-black text-cayo-burgundy/30 mt-0.5">—</p>
            )}
          </div>
        </div>

        {/* Search + status filter + add */}
        <div className="mb-4 space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="חיפוש לפי שם, טלפון או אימייל"
                className="w-full border-2 border-cayo-burgundy/20 rounded-full px-4 py-2.5 pr-10 text-sm text-cayo-burgundy font-bold placeholder:text-cayo-burgundy/40 focus:outline-none focus:border-cayo-burgundy"
              />
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cayo-burgundy/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-cayo-burgundy/40 hover:text-cayo-burgundy"
                  aria-label="נקה חיפוש"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={openCreate}
              className="text-sm font-black px-4 py-2.5 rounded-full bg-cayo-burgundy text-white hover:bg-cayo-burgundy/90 transition-colors flex items-center gap-1.5 shrink-0"
            >
              <span className="text-lg leading-none">+</span>
              <span className="hidden sm:inline">הוספה</span>
            </button>
          </div>

          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'all', label: `הכל (${dayAll.length})` },
              {
                key: 'approved',
                label: `מאושר (${dayTotals.confirmed + dayTotals.arrived})`,
              },
              {
                key: 'not_approved',
                label: `לא מאושר (${dayTotals.pending + dayTotals.cancelled + dayTotals.no_show})`,
              },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-colors ${
                  statusFilter === f.key
                    ? 'bg-cayo-burgundy text-white border-cayo-burgundy'
                    : 'bg-white text-cayo-burgundy border-cayo-burgundy/20 hover:border-cayo-burgundy/50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <h2 className="text-sm font-bold text-cayo-burgundy/60">
            {dayItems.length === 0
              ? (searchQuery || statusFilter !== 'all' ? 'אין תוצאות עבור החיפוש' : 'אין הזמנות ליום זה')
              : `מציג ${dayItems.length} ${dayItems.length === 1 ? 'הזמנה' : 'הזמנות'}`}
          </h2>
        </div>

        {/* Reservations list — bar + tables in parallel columns on lg screens */}
        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-16 font-bold">טוען...</p>
        ) : dayItems.length === 0 ? (
          <button
            onClick={openCreate}
            className="block w-full py-16 border-2 border-dashed border-cayo-burgundy/20 rounded-2xl text-cayo-burgundy/40 hover:border-cayo-burgundy/50 hover:text-cayo-burgundy/70 transition-colors font-bold"
          >
            {searchQuery || statusFilter !== 'all' ? 'נקה מסננים כדי להוסיף' : '+ הוספת הזמנה ראשונה ליום זה'}
          </button>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar column */}
            <section>
              <header className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-sm font-black text-cayo-burgundy uppercase tracking-wider">
                  בר
                </h3>
                <span className="text-xs font-bold text-cayo-burgundy/50">
                  {barItems.length} {barItems.length === 1 ? 'הזמנה' : 'הזמנות'}
                  {' · '}
                  {barItems.filter(r => r.status !== 'cancelled' && r.status !== 'no_show').reduce((s, r) => s + r.guests, 0)} סועדים
                </span>
              </header>
              {barItems.length === 0 ? (
                <p className="text-center text-cayo-burgundy/30 font-bold py-8 border-2 border-dashed border-cayo-burgundy/10 rounded-xl">
                  אין הזמנות בר
                </p>
              ) : (
                <div className="space-y-2">{barItems.map(renderRow)}</div>
              )}
            </section>

            {/* Tables column */}
            <section>
              <header className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-sm font-black text-cayo-burgundy uppercase tracking-wider">
                  שולחנות
                </h3>
                <span className="text-xs font-bold text-cayo-burgundy/50">
                  {tableItems.length} {tableItems.length === 1 ? 'הזמנה' : 'הזמנות'}
                  {' · '}
                  {tableItems.filter(r => r.status !== 'cancelled' && r.status !== 'no_show').reduce((s, r) => s + r.guests, 0)} סועדים
                </span>
              </header>
              {tableItems.length === 0 ? (
                <p className="text-center text-cayo-burgundy/30 font-bold py-8 border-2 border-dashed border-cayo-burgundy/10 rounded-xl">
                  אין הזמנות שולחנות
                </p>
              ) : (
                <div className="space-y-2">{tableItems.map(renderRow)}</div>
              )}
            </section>
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

      {pickerFor && (
        <TablePickerModal
          open={true}
          onClose={() => setPickerFor(null)}
          reservation={pickerFor}
          allReservations={items}
          onSaved={(tables) => {
            // Optimistic local update — replace the tables array on the
            // affected reservation only. The API already returned the
            // authoritative list so we don't need a re-fetch.
            setItems(prev =>
              prev.map(it => (it.id === pickerFor.id ? { ...it, tables } : it))
            )
            setPickerFor(null)
          }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-cayo-red/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-cayo-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-cayo-burgundy mb-2">למחוק את ההזמנה?</h3>
            <p className="text-sm text-cayo-burgundy/70 mb-5">
              ההזמנה של <span className="font-bold">{deleteConfirm.name || '— ללא שם —'}</span> ל-{deleteConfirm.time} תימחק לצמיתות. לא ניתן לשחזר.
            </p>
            <p className="text-xs text-cayo-burgundy/50 mb-5">
              טיפ: לביטול בלי למחוק — השתמש ב&quot;ביטול&quot; כדי לשמור תיעוד.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 bg-cayo-red text-white font-black rounded-full hover:bg-cayo-red/90"
              >
                מחק לצמיתות
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 border-2 border-cayo-burgundy/30 text-cayo-burgundy font-black rounded-full hover:bg-cayo-burgundy/5"
              >
                חזרה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ───── Root ─────
export default function AdminPage() {
  const { data: session, status } = useSession()
  const [errorParam, setErrorParam] = useState<string | null>(null)

  // Read ?error=... from the URL (NextAuth appends this on /admin when sign-in is rejected).
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      setErrorParam(params.get('error'))
    }
  }, [])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-cayo-burgundy/50 font-bold">טוען...</p>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen errorParam={errorParam} />
  }

  return <Dashboard />
}
