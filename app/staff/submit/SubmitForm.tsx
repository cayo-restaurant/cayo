'use client'

// Availability submission for the upcoming week.
//
// The employee sees the next 6 work days (Sunday → Saturday, skipping
// Friday — the restaurant is closed) and checks which ones they can
// open and/or close. Both boxes can be ticked on the same day. Each
// toggle auto-saves to /api/staff/shift-requests; there's no "submit"
// button — the last state the employee leaves the page in is what the
// admin sees.
//
// "Upcoming week" = the next Sunday. If today is Sunday, we use today
// (the employee is submitting for the current week); otherwise we jump
// to the next Sunday. The admin typically freezes the rota a few days
// before the week starts, but that enforcement happens on their side —
// the form here remains open.
//
// Data model: existence = available. We PUT { date, shift_type,
// available: true|false } and the server either upserts a row or
// deletes it. No boolean column, no tri-state.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type ShiftType = 'opening' | 'closing'

interface ShiftRequest {
  date: string
  shift_type: ShiftType
}

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The Sunday that starts the "upcoming week". If today is already
// Sunday we stay on today; otherwise we advance to the next Sunday.
function upcomingSunday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay() // 0 = Sunday
  if (dow === 0) return today
  const d = new Date(today)
  d.setDate(today.getDate() + (7 - dow))
  return d
}

// 6 dates — Sunday through Saturday, minus Friday.
function workDays(sunday: Date): string[] {
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    if (i === 5) continue // Friday — restaurant closed
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    out.push(toStr(d))
  }
  return out
}

function dayLabel(dateStr: string): string {
  const [y, mo, da] = dateStr.split('-').map(Number)
  const dow = new Date(y, mo - 1, da).getDay()
  return `${HEBREW_DAYS[dow]} ${da}/${mo}`
}

function weekHeading(dates: string[]): string {
  if (dates.length === 0) return ''
  const first = dates[0]
  const last = dates[dates.length - 1]
  const [, m1, d1] = first.split('-').map(Number)
  const [, m2, d2] = last.split('-').map(Number)
  if (m1 === m2) return `${d1}-${d2} ${HEBREW_MONTHS[m1 - 1]}`
  return `${d1} ${HEBREW_MONTHS[m1 - 1]} – ${d2} ${HEBREW_MONTHS[m2 - 1]}`
}

// Key used in the Set of currently-selected (date, shift_type) pairs.
function makeKey(date: string, type: ShiftType) {
  return `${date}|${type}`
}

export default function SubmitForm() {
  const sunday = useMemo(upcomingSunday, [])
  const weekStart = useMemo(() => toStr(sunday), [sunday])
  const dates = useMemo(() => workDays(sunday), [sunday])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Per-cell pending state so we can show a tiny spinner and prevent
  // double-clicks racing each other.
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Initial load — pull everything already submitted for this week.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/staff/shift-requests?week=${weekStart}`, { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setError('שגיאה בטעינת הבקשות')
          return
        }
        const data: ShiftRequest[] = await res.json()
        if (cancelled) return
        const s = new Set<string>()
        for (const r of Array.isArray(data) ? data : []) {
          s.add(makeKey(r.date, r.shift_type))
        }
        setSelected(s)
      } catch {
        if (!cancelled) setError('אין חיבור לשרת')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [weekStart])

  async function toggle(date: string, type: ShiftType) {
    const key = makeKey(date, type)
    if (pending.has(key)) return
    const currentlyOn = selected.has(key)
    const next = !currentlyOn

    // Optimistic UI: flip the box immediately, roll back on failure.
    setSelected(prev => {
      const s = new Set(prev)
      if (next) s.add(key); else s.delete(key)
      return s
    })
    setPending(prev => { const s = new Set(prev); s.add(key); return s })
    setError('')

    try {
      const res = await fetch('/api/staff/shift-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, shift_type: type, available: next }),
      })
      if (!res.ok) {
        // Roll back.
        setSelected(prev => {
          const s = new Set(prev)
          if (currentlyOn) s.add(key); else s.delete(key)
          return s
        })
        setError('שמירה נכשלה, נסי שוב')
      } else {
        setSavedAt(Date.now())
      }
    } catch {
      setSelected(prev => {
        const s = new Set(prev)
        if (currentlyOn) s.add(key); else s.delete(key)
        return s
      })
      setError('אין חיבור לשרת')
    } finally {
      setPending(prev => {
        const s = new Set(prev)
        s.delete(key)
        return s
      })
    }
  }

  return (
    <div className="min-h-screen bg-white pb-10" dir="rtl">
      {/* Header */}
      <header className="border-b-2 border-cayo-burgundy/10 bg-white sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/staff"
            className="text-xs font-bold text-cayo-burgundy/60 hover:text-cayo-burgundy transition py-1"
          >
            ← חזרה
          </Link>
          <h1 className="text-base font-black text-cayo-burgundy">הגשת משמרות</h1>
          <div className="w-12" aria-hidden="true" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        <div className="mb-4">
          <p className="text-xs font-bold text-cayo-burgundy/60">השבוע הקרוב</p>
          <h2 className="text-xl font-black text-cayo-burgundy mt-0.5">
            {weekHeading(dates)}
          </h2>
          <p className="text-[11px] font-bold text-cayo-burgundy/50 mt-1.5 leading-relaxed">
            סמני בכל יום אם את זמינה לפתיחה, לסגירה, או לשניהם. השמירה אוטומטית.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 bg-cayo-red/5 border-2 border-cayo-red/30 rounded-xl p-3 text-center text-sm font-bold text-cayo-red"
          >
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-12 font-bold">טוען...</p>
        ) : (
          <ul className="space-y-2 list-none p-0">
            {dates.map(d => (
              <DayRow
                key={d}
                date={d}
                openingOn={selected.has(makeKey(d, 'opening'))}
                closingOn={selected.has(makeKey(d, 'closing'))}
                openingBusy={pending.has(makeKey(d, 'opening'))}
                closingBusy={pending.has(makeKey(d, 'closing'))}
                onToggle={toggle}
              />
            ))}
          </ul>
        )}

        {savedAt && !loading && (
          <p className="text-center text-[11px] font-bold text-cayo-burgundy/40 mt-4">
            נשמר
          </p>
        )}
      </main>
    </div>
  )
}

function DayRow({
  date,
  openingOn,
  closingOn,
  openingBusy,
  closingBusy,
  onToggle,
}: {
  date: string
  openingOn: boolean
  closingOn: boolean
  openingBusy: boolean
  closingBusy: boolean
  onToggle: (date: string, type: ShiftType) => void
}) {
  return (
    <li className="rounded-xl border-2 border-cayo-burgundy/15 bg-white p-3 list-none">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-cayo-burgundy flex-shrink-0">
          {dayLabel(date)}
        </h3>
        <div className="flex gap-2">
          <ShiftCheckbox
            label="פתיחה"
            checked={openingOn}
            busy={openingBusy}
            onClick={() => onToggle(date, 'opening')}
          />
          <ShiftCheckbox
            label="סגירה"
            checked={closingOn}
            busy={closingBusy}
            onClick={() => onToggle(date, 'closing')}
          />
        </div>
      </div>
    </li>
  )
}

function ShiftCheckbox({
  label,
  checked,
  busy,
  onClick,
}: {
  label: string
  checked: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      disabled={busy}
      className={`min-w-[80px] px-3 py-2 rounded-lg border-2 text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cayo-burgundy/60 focus-visible:ring-offset-1 disabled:opacity-60
        ${checked
          ? 'bg-cayo-burgundy text-white border-cayo-burgundy hover:bg-cayo-burgundy/90'
          : 'bg-white text-cayo-burgundy/70 border-cayo-burgundy/20 hover:border-cayo-burgundy/50'}`}
    >
      <span
        aria-hidden="true"
        className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] leading-none
          ${checked ? 'bg-white border-white text-cayo-burgundy' : 'border-cayo-burgundy/30 text-transparent'}`}
      >
        ✓
      </span>
      <span>{label}</span>
    </button>
  )
}
