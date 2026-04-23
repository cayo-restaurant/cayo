'use client'

// Read-only rota view for all staff. Mirrors the grid layout of
// /admin/hours — roles as rows, days as columns, each filled cell shows
// "name • start-end". Unlike the admin view, there is no editing here:
// no slot-add, no drag, no modals. Two tabs let the employee switch
// between the full company rota and just their own shifts.
//
// Data is fetched from /api/staff/rota (which strips hourly_rate).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Role = 'bartender' | 'waiter' | 'host' | 'kitchen' | 'dishwasher' | 'manager'

interface Shift {
  id: string
  employee_id: string
  role: Role
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  notes: string | null
  employees: { full_name: string } | null
}

const ROLE_LABEL: Record<Role, string> = {
  manager: 'אחמ"ש',
  bartender: 'בר',
  waiter: 'מלצרים',
  host: 'מארחת',
  kitchen: 'מטבח',
  dishwasher: 'שטיפה',
}

const ROLE_HEADER_COLOR: Record<Role, string> = {
  manager: 'bg-purple-50 border-purple-200 text-purple-800',
  bartender: 'bg-blue-50 border-blue-200 text-blue-800',
  waiter: 'bg-green-50 border-green-200 text-green-800',
  host: 'bg-pink-50 border-pink-200 text-pink-800',
  kitchen: 'bg-orange-50 border-orange-200 text-orange-800',
  dishwasher: 'bg-teal-50 border-teal-200 text-teal-800',
}

const ROLE_CELL_COLOR: Record<Role, string> = {
  manager: 'bg-purple-100 border-purple-300 text-purple-800',
  bartender: 'bg-blue-100 border-blue-300 text-blue-800',
  waiter: 'bg-green-100 border-green-300 text-green-800',
  host: 'bg-pink-100 border-pink-300 text-pink-800',
  kitchen: 'bg-orange-100 border-orange-300 text-orange-800',
  dishwasher: 'bg-teal-100 border-teal-300 text-teal-800',
}

const ROLE_ORDER: Role[] = ['manager', 'bartender', 'waiter', 'host', 'kitchen', 'dishwasher']

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() { return toStr(new Date()) }

function weekStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  // Sunday-start week (Israel)
  date.setDate(date.getDate() - date.getDay())
  return date
}

function weekDates(anchor: string): string[] {
  const sun = weekStart(anchor)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun)
    d.setDate(sun.getDate() + i)
    return toStr(d)
  })
}

function weekLabel(dates: string[]): string {
  const [, m1, d1] = dates[0].split('-').map(Number)
  const [, m2, d2] = dates[6].split('-').map(Number)
  if (m1 === m2) return `${d1}-${d2} ${HEBREW_MONTHS[m1 - 1]}`
  return `${d1} ${HEBREW_MONTHS[m1 - 1]} - ${d2} ${HEBREW_MONTHS[m2 - 1]}`
}

function shiftWeek(anchor: string, delta: number): string {
  const [y, m, d] = anchor.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta * 7)
  return toStr(date)
}

function dayLabel(dateStr: string): string {
  const [y, mo, da] = dateStr.split('-').map(Number)
  const dow = new Date(y, mo - 1, da).getDay()
  return `${HEBREW_DAYS[dow]} ${da}/${mo}`
}

type Tab = 'company' | 'mine'

export default function StaffRota() {
  const [anchor, setAnchor] = useState(todayStr())
  const [shifts, setShifts] = useState<Shift[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('company')

  const dates = useMemo(() => weekDates(anchor), [anchor])
  const today = todayStr()

  useEffect(() => {
    // Who am I — needed for the "שלי" filter.
    fetch('/api/host/me', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.id) setMyId(data.id) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const weekStartStr = dates[0]
        const res = await fetch(`/api/staff/rota?week=${weekStartStr}`, { cache: 'no-store' })
        if (!res.ok) {
          setError('שגיאה בטעינת הסידור')
          setShifts([])
          return
        }
        const data: Shift[] = await res.json()
        setShifts(Array.isArray(data) ? data : [])
      } catch {
        setError('אין חיבור לשרת')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [anchor])

  // Group shifts by date + role for fast cell lookup. Uses the full
  // `shifts` list (the mine/company filter is applied at render time).
  const shiftsByDateRole = useMemo(() => {
    const map: Record<string, Shift[]> = {}
    for (const s of shifts) {
      const key = `${s.date}_${s.role}`
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return map
  }, [shifts])

  const mineByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {}
    if (!myId) return map
    for (const s of shifts) {
      if (s.employee_id !== myId) continue
      if (!map[s.date]) map[s.date] = []
      map[s.date].push(s)
    }
    return map
  }, [shifts, myId])

  return (
    <div className="min-h-screen bg-white pb-10" dir="rtl">
      {/* Header */}
      <header className="border-b-2 border-cayo-burgundy/10 bg-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/staff"
            className="text-xs font-bold text-cayo-burgundy/60 hover:text-cayo-burgundy transition py-1"
          >
            ← חזרה
          </Link>
          <h1 className="text-base font-black text-cayo-burgundy">סידור העבודה</h1>
          <div className="w-12" aria-hidden="true" />
        </div>
        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 pb-2 flex gap-1">
          <TabButton active={tab === 'company'} onClick={() => setTab('company')}>
            החברה
          </TabButton>
          <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
            שלי
          </TabButton>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4">
        {/* Week nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setAnchor(shiftWeek(anchor, -1))}
            className="px-3 py-1.5 text-sm font-black text-cayo-burgundy rounded-lg border-2 border-cayo-burgundy/15 hover:border-cayo-burgundy/40 transition"
          >
            ← שבוע קודם
          </button>
          <div className="flex flex-col items-center">
            <p className="text-sm font-black text-cayo-burgundy">{weekLabel(dates)}</p>
            <button
              onClick={() => setAnchor(today)}
              className="text-[11px] font-bold text-cayo-burgundy/60 hover:text-cayo-burgundy underline decoration-dotted mt-0.5"
            >
              השבוע
            </button>
          </div>
          <button
            onClick={() => setAnchor(shiftWeek(anchor, 1))}
            className="px-3 py-1.5 text-sm font-black text-cayo-burgundy rounded-lg border-2 border-cayo-burgundy/15 hover:border-cayo-burgundy/40 transition"
          >
            שבוע הבא →
          </button>
        </div>

        {error && (
          <div className="mb-3 bg-cayo-red/5 border-2 border-cayo-red/30 rounded-xl p-3 text-center text-sm font-bold text-cayo-red">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-12 font-bold">טוען...</p>
        ) : tab === 'company' ? (
          <CompanyGrid
            dates={dates}
            today={today}
            shiftsByDateRole={shiftsByDateRole}
          />
        ) : (
          <MineList
            dates={dates}
            today={today}
            mineByDate={mineByDate}
            hasMyId={Boolean(myId)}
          />
        )}
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-t-lg text-sm font-black border-2 border-b-0 transition
        ${active
          ? 'bg-cayo-burgundy text-white border-cayo-burgundy'
          : 'bg-white text-cayo-burgundy/60 border-cayo-burgundy/15 hover:text-cayo-burgundy hover:border-cayo-burgundy/40'}`}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

function CompanyGrid({
  dates,
  today,
  shiftsByDateRole,
}: {
  dates: string[]
  today: string
  shiftsByDateRole: Record<string, Shift[]>
}) {
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-cayo-burgundy/10">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky right-0 bg-white border-b-2 border-l-2 border-cayo-burgundy/10 p-2 text-xs font-black text-cayo-burgundy/60 min-w-[80px]">
              תפקיד
            </th>
            {dates.map(d => (
              <th
                key={d}
                className={`border-b-2 border-l-2 border-cayo-burgundy/10 p-2 text-xs font-black min-w-[120px]
                  ${d === today ? 'bg-cayo-burgundy/5 text-cayo-burgundy' : 'text-cayo-burgundy/70'}`}
              >
                {dayLabel(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLE_ORDER.map(role => (
            <tr key={role}>
              <th
                scope="row"
                className={`sticky right-0 border-b border-l-2 border-cayo-burgundy/10 p-2 text-xs font-black text-right ${ROLE_HEADER_COLOR[role]}`}
              >
                {ROLE_LABEL[role]}
              </th>
              {dates.map(d => {
                const cell = shiftsByDateRole[`${d}_${role}`] || []
                return (
                  <td
                    key={`${d}_${role}`}
                    className={`border-b border-l-2 border-cayo-burgundy/10 p-1.5 align-top min-w-[120px] ${d === today ? 'bg-cayo-burgundy/[0.03]' : ''}`}
                  >
                    <div className="flex flex-col gap-1">
                      {cell.length === 0 ? (
                        <span className="text-[10px] font-bold text-cayo-burgundy/30">—</span>
                      ) : cell.map(s => (
                        <div
                          key={s.id}
                          className={`rounded-md border text-[11px] font-bold leading-tight px-1.5 py-1 ${ROLE_CELL_COLOR[role]}`}
                        >
                          <div className="truncate">{s.employees?.full_name || 'עובד/ת'}</div>
                          <div className="text-[10px] opacity-80" dir="ltr">
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MineList({
  dates,
  today,
  mineByDate,
  hasMyId,
}: {
  dates: string[]
  today: string
  mineByDate: Record<string, Shift[]>
  hasMyId: boolean
}) {
  if (!hasMyId) {
    return (
      <p className="text-center text-cayo-burgundy/60 font-bold py-10">
        טוען את פרטיך...
      </p>
    )
  }
  const total = dates.reduce((n, d) => n + (mineByDate[d]?.length || 0), 0)
  if (total === 0) {
    return (
      <div className="py-10 text-center text-cayo-burgundy/50 font-bold border-2 border-dashed border-cayo-burgundy/20 rounded-2xl">
        אין לך משמרות השבוע
      </div>
    )
  }
  return (
    <ul className="space-y-2 list-none p-0">
      {dates.map(d => {
        const mine = mineByDate[d] || []
        if (mine.length === 0) return null
        return (
          <li
            key={d}
            className={`rounded-xl border-2 p-3 list-none ${d === today ? 'border-cayo-burgundy/40 bg-cayo-burgundy/[0.03]' : 'border-cayo-burgundy/15 bg-white'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-black text-cayo-burgundy">{dayLabel(d)}</h3>
              {d === today && (
                <span className="text-[10px] font-black text-cayo-burgundy bg-cayo-burgundy/10 px-2 py-0.5 rounded-full">
                  היום
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {mine.map(s => (
                <div
                  key={s.id}
                  className={`rounded-md border text-xs font-bold px-2 py-1.5 flex justify-between items-center ${ROLE_CELL_COLOR[s.role]}`}
                >
                  <span>{ROLE_LABEL[s.role]}</span>
                  <span dir="ltr">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                </div>
              ))}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
