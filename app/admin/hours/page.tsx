'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Role = 'bartender' | 'waiter' | 'host' | 'kitchen' | 'dishwasher' | 'manager'

interface Employee {
  id: string
  full_name: string
  role: Role
  hourly_rate: number
  active: boolean
}

interface Shift {
  id: string
  employee_id: string
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  notes: string | null
  employees: { full_name: string; role: Role; hourly_rate: number } | null
}

const ROLE_LABEL: Record<Role, string> = {
  manager: 'אחמ"ש',
  bartender: 'ברמן',
  waiter: 'מלצר',
  host: 'מארח',
  kitchen: 'מטבח',
  dishwasher: 'שוטף',
}

const ROLE_COLOR: Record<Role, string> = {
  manager: 'bg-purple-500',
  bartender: 'bg-blue-500',
  waiter: 'bg-green-500',
  host: 'bg-pink-500',
  kitchen: 'bg-orange-500',
  dishwasher: 'bg-teal-500',
}

const ROLE_COLOR_LIGHT: Record<Role, string> = {
  manager: 'bg-purple-50 border-purple-200',
  bartender: 'bg-blue-50 border-blue-200',
  waiter: 'bg-green-50 border-green-200',
  host: 'bg-pink-50 border-pink-200',
  kitchen: 'bg-orange-50 border-orange-200',
  dishwasher: 'bg-teal-50 border-teal-200',
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

export default function HoursPage() {
  const { status } = useSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeesLoaded, setEmployeesLoaded] = useState(false)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [anchor, setAnchor] = useState(todayStr())
  const [loading, setLoading] = useState(true)

  // Edit modal state
  const [editModal, setEditModal] = useState<{
    empId: string
    date: string
    shiftId: string | null
    start: string
    end: string
    breakMin: number
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const dates = useMemo(() => weekDates(anchor), [anchor])
  const today = todayStr()

  // Group shifts by employee+date for quick lookup
  const shiftMap = useMemo(() => {
    const map: Record<string, Shift> = {}
    for (const s of shifts) {
      map[`${s.employee_id}_${s.date}`] = s
    }
    return map
  }, [shifts])

  // Sort employees by role order
  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
  }, [employees])

  useEffect(() => {
    if (status === 'authenticated') fetchEmployees()
  }, [status])

  useEffect(() => {
    if (status === 'authenticated' && employeesLoaded) {
      if (employees.length > 0) {
        fetchWeekShifts()
      } else {
        setLoading(false)
      }
    }
  }, [status, anchor, employeesLoaded, employees])

  async function fetchEmployees() {
    const res = await fetch('/api/employees')
    if (res.ok) {
      const data: Employee[] = await res.json()
      setEmployees(data.filter(e => e.active))
    }
    setEmployeesLoaded(true)
  }

  async function fetchWeekShifts() {
    setLoading(true)
    const months = new Set(dates.map(d => d.slice(0, 7)))
    const allShifts: Shift[] = []
    for (const m of months) {
      const res = await fetch(`/api/shifts?month=${m}`)
      if (res.ok) allShifts.push(...(await res.json()))
    }
    const dateSet = new Set(dates)
    setShifts(allShifts.filter(s => dateSet.has(s.date)))
    setLoading(false)
  }

  function openEdit(empId: string, date: string) {
    const existing = shiftMap[`${empId}_${date}`]
    setEditModal({
      empId,
      date,
      shiftId: existing?.id || null,
      start: existing ? existing.start_time.slice(0, 5) : '18:00',
      end: existing ? existing.end_time.slice(0, 5) : '02:00',
      breakMin: existing?.break_minutes || 0,
    })
  }

  async function saveShift() {
    if (!editModal) return
    setSaving(true)
    const { empId, date, shiftId, start, end, breakMin } = editModal
    const payload = {
      employee_id: empId,
      date,
      start_time: start,
      end_time: end,
      break_minutes: breakMin,
    }

    if (shiftId) {
      await fetch(`/api/shifts/${shiftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    setSaving(false)
    setEditModal(null)
    await fetchWeekShifts()
  }

  async function deleteShift() {
    if (!editModal?.shiftId) return
    setSaving(true)
    await fetch(`/api/shifts/${editModal.shiftId}`, { method: 'DELETE' })
    setSaving(false)
    setEditModal(null)
    await fetchWeekShifts()
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">
          {"יש להתחבר דרך "}
          <Link href="/admin" className="text-cayo-burgundy underline">עמוד הניהול</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-cayo-burgundy">שעות עבודה</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/employees" className="text-sm text-cayo-burgundy hover:underline">
              ניהול עובדים
            </Link>
            <a
              href={`/api/shifts/export?month=${dates[0].slice(0, 7)}`}
              className="px-3 py-1.5 border border-cayo-burgundy text-cayo-burgundy text-sm font-bold rounded-lg hover:bg-cayo-burgundy/5 transition-colors"
            >
              ייצוא CSV
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Week navigation */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg">
            <button onClick={() => setAnchor(shiftWeek(anchor, 1))} className="px-3 py-2 hover:bg-gray-50 rounded-r-lg text-gray-600">
              &rarr;
            </button>
            <span className="px-5 py-2 text-sm font-medium text-gray-700 min-w-[200px] text-center">
              {weekLabel(dates)}
            </span>
            <button onClick={() => setAnchor(shiftWeek(anchor, -1))} className="px-3 py-2 hover:bg-gray-50 rounded-l-lg text-gray-600">
              &larr;
            </button>
          </div>
          <button onClick={() => setAnchor(todayStr())} className="px-3 py-2 text-sm text-cayo-burgundy hover:underline">
            השבוע
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            {"אין עובדים פעילים. "}
            <Link href="/admin/employees" className="text-cayo-burgundy underline">הוסף עובדים</Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[900px]">
              {/* Header: days */}
              <thead>
                <tr>
                  <th className="sticky right-0 z-10 bg-white border-b border-l border-gray-200 px-4 py-3 text-right text-sm font-bold text-gray-700 w-[160px]">
                    עובד
                  </th>
                  {dates.map((date, i) => {
                    const [, mo, da] = date.split('-').map(Number)
                    const isToday = date === today
                    return (
                      <th
                        key={date}
                        className={`border-b border-l border-gray-200 px-2 py-3 text-center min-w-[120px] ${isToday ? 'bg-cayo-burgundy text-white' : 'bg-gray-50 text-gray-700'}`}
                      >
                        <div className={`text-xs font-bold ${isToday ? 'text-white/70' : 'text-gray-400'}`}>{HEBREW_DAYS[i]}</div>
                        <div className="text-base font-bold">{da}</div>
                        <div className={`text-[10px] ${isToday ? 'text-white/50' : 'text-gray-400'}`}>{HEBREW_MONTHS[mo - 1]}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map((emp, empIdx) => {
                  const isFirstOfRole = empIdx === 0 || sortedEmployees[empIdx - 1].role !== emp.role
                  return (
                    <tr key={emp.id} className={isFirstOfRole && empIdx > 0 ? 'border-t-2 border-gray-300' : ''}>
                      {/* Employee name cell */}
                      <td className="sticky right-0 z-10 bg-white border-b border-l border-gray-200 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ROLE_COLOR[emp.role]}`} />
                          <div>
                            <div className="text-sm font-medium text-gray-900 truncate max-w-[120px]">{emp.full_name}</div>
                            <div className="text-[10px] text-gray-400">{ROLE_LABEL[emp.role]}</div>
                          </div>
                        </div>
                      </td>
                      {/* Day cells */}
                      {dates.map(date => {
                        const shift = shiftMap[`${emp.id}_${date}`]
                        const isToday = date === today
                        return (
                          <td
                            key={date}
                            onClick={() => openEdit(emp.id, date)}
                            className={`border-b border-l border-gray-200 px-1.5 py-1.5 cursor-pointer hover:bg-gray-50 transition-colors align-top h-[60px] ${isToday ? 'bg-cayo-burgundy/[0.02]' : ''}`}
                          >
                            {shift ? (
                              <div className={`rounded-md border px-2 py-1.5 ${ROLE_COLOR_LIGHT[emp.role]}`}>
                                <div className="text-[11px] font-bold text-gray-700 text-center">
                                  {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                                </div>
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center opacity-0 hover:opacity-30 transition-opacity">
                                <span className="text-2xl text-gray-300">+</span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-[340px] p-5" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-cayo-burgundy">
                {editModal.shiftId ? 'עריכת משמרת' : 'הוספת משמרת'}
              </h3>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>

            <div className="text-sm text-gray-500 mb-4">
              {employees.find(e => e.id === editModal.empId)?.full_name}
              {' \u00B7 '}
              {(() => {
                const [, mo, da] = editModal.date.split('-').map(Number)
                const d = new Date(Number(editModal.date.split('-')[0]), mo - 1, da)
                return `${HEBREW_DAYS[d.getDay()]}, ${da} ${HEBREW_MONTHS[mo - 1]}`
              })()}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-16">התחלה</label>
                <input
                  type="time"
                  value={editModal.start}
                  onChange={e => setEditModal({ ...editModal, start: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-16">סיום</label>
                <input
                  type="time"
                  value={editModal.end}
                  onChange={e => setEditModal({ ...editModal, end: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-16">הפסקה</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={editModal.breakMin}
                    onChange={e => setEditModal({ ...editModal, breakMin: parseInt(e.target.value) || 0 })}
                    className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                  />
                  <span className="text-xs text-gray-400">{"דק\u0027"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={saveShift}
                disabled={saving}
                className="flex-1 py-2.5 bg-cayo-burgundy text-white text-sm font-bold rounded-lg hover:bg-cayo-burgundy/90 transition-colors disabled:opacity-50"
              >
                {saving ? '...' : 'שמור'}
              </button>
              {editModal.shiftId && (
                <button
                  onClick={deleteShift}
                  disabled={saving}
                  className="py-2.5 px-4 border border-red-300 text-red-500 text-sm font-bold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  מחק
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
