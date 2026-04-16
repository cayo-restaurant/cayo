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
  bartender: 'ברמן',
  waiter: 'מלצר',
  host: 'מארח',
  kitchen: 'מטבח',
  dishwasher: 'שוטף',
  manager: 'אחמ"ש',
}

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/* ── helpers ─────────────────────────────────────── */

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr() { return toStr(new Date()) }

/** Get the Sunday that starts the week containing `dateStr` */
function weekStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay() // 0=Sun
  date.setDate(date.getDate() - day)
  return date
}

/** Return array of 7 date strings (Sun..Sat) for the week */
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

/* ── component ───────────────────────────────────── */

export default function HoursPage() {
  const { status } = useSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [anchor, setAnchor] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [employeesLoaded, setEmployeesLoaded] = useState(false)

  // dropdown state: which day cell has the "add employee" dropdown open
  const [dropdownDay, setDropdownDay] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // inline editing: which shift's start/end is being edited
  const [editingShift, setEditingShift] = useState<{ id: string; field: 'start' | 'end' } | null>(null)
  const [editValue, setEditValue] = useState('')

  const dates = useMemo(() => weekDates(anchor), [anchor])
  const today = todayStr()

  // Map: date -> shifts for that date
  const shiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {}
    for (const d of dates) map[d] = []
    for (const s of shifts) {
      if (map[s.date]) map[s.date].push(s)
    }
    return map
  }, [shifts, dates])

  /* ── data fetching ── */

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
    // We need shifts for potentially 2 months if the week spans a month boundary
    const months = new Set(dates.map(d => d.slice(0, 7)))
    const allShifts: Shift[] = []
    for (const m of months) {
      const res = await fetch(`/api/shifts?month=${m}`)
      if (res.ok) {
        const data: Shift[] = await res.json()
        allShifts.push(...data)
      }
    }
    // Filter to only this week's dates
    const dateSet = new Set(dates)
    setShifts(allShifts.filter(s => dateSet.has(s.date)))
    setLoading(false)
  }

  /* ── actions ── */

  async function addShift(date: string, empId: string) {
    setDropdownDay(null)
    const res = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: empId,
        date,
        start_time: '18:00',
        end_time: '02:00',
        break_minutes: 0,
      }),
    })
    if (res.ok || res.status === 409) {
      await fetchWeekShifts()
    }
  }

  async function removeShift(shiftId: string) {
    await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE' })
    setShifts(prev => prev.filter(s => s.id !== shiftId))
  }

  async function saveTime(shiftId: string, field: 'start' | 'end', value: string) {
    setEditingShift(null)
    if (!value) return
    const shift = shifts.find(s => s.id === shiftId)
    if (!shift) return

    const payload = {
      employee_id: shift.employee_id,
      date: shift.date,
      start_time: field === 'start' ? value : shift.start_time.slice(0, 5),
      end_time: field === 'end' ? value : shift.end_time.slice(0, 5),
      break_minutes: shift.break_minutes,
    }

    await fetch(`/api/shifts/${shiftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await fetchWeekShifts()
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownDay(null)
      }
    }
    if (dropdownDay) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownDay])

  /* ── available employees for a given day (not already assigned) ── */
  function availableForDay(date: string): Employee[] {
    const assigned = new Set((shiftsByDate[date] || []).map(s => s.employee_id))
    return employees.filter(e => !assigned.has(e.id))
  }

  /* ── render ── */

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
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
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

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        {/* Week navigation */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg">
            <button
              onClick={() => setAnchor(shiftWeek(anchor, 1))}
              className="px-3 py-2 hover:bg-gray-50 rounded-r-lg text-gray-600"
            >
              &rarr;
            </button>
            <span className="px-5 py-2 text-sm font-medium text-gray-700 min-w-[200px] text-center">
              {weekLabel(dates)}
            </span>
            <button
              onClick={() => setAnchor(shiftWeek(anchor, -1))}
              className="px-3 py-2 hover:bg-gray-50 rounded-l-lg text-gray-600"
            >
              &larr;
            </button>
          </div>
          <button
            onClick={() => setAnchor(todayStr())}
            className="px-3 py-2 text-sm text-cayo-burgundy hover:underline"
          >
            השבוע
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          /* Weekly table */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 min-h-[400px]">
              {dates.map((date, i) => {
                const [, mo, da] = date.split('-').map(Number)
                const isToday = date === today
                const dayShifts = shiftsByDate[date] || []
                const available = availableForDay(date)

                return (
                  <div
                    key={date}
                    className={`flex flex-col border-l border-gray-200 first:border-l-0 ${isToday ? 'bg-cayo-burgundy/[0.03]' : ''}`}
                  >
                    {/* Day header */}
                    <div className={`px-2 py-2.5 border-b border-gray-200 text-center ${isToday ? 'bg-cayo-burgundy text-white' : 'bg-gray-50'}`}>
                      <div className={`text-xs font-bold ${isToday ? 'text-white/70' : 'text-gray-500'}`}>
                        {HEBREW_DAYS[i]}
                      </div>
                      <div className={`text-lg font-bold ${isToday ? 'text-white' : 'text-gray-800'}`}>
                        {da}
                      </div>
                      <div className={`text-[10px] ${isToday ? 'text-white/50' : 'text-gray-400'}`}>
                        {HEBREW_MONTHS[mo - 1]}
                      </div>
                    </div>

                    {/* Shifts */}
                    <div className="flex-1 p-1.5 space-y-1.5">
                      {dayShifts.map(shift => {
                        const emp = employees.find(e => e.id === shift.employee_id)
                        const empName = shift.employees?.full_name || emp?.full_name || '?'
                        const empRole = shift.employees?.role || emp?.role
                        const startTime = shift.start_time.slice(0, 5)
                        const endTime = shift.end_time.slice(0, 5)

                        return (
                          <div
                            key={shift.id}
                            className="group bg-cayo-burgundy/5 rounded-lg p-2 relative"
                          >
                            {/* Remove button */}
                            <button
                              onClick={() => removeShift(shift.id)}
                              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              title="הסר"
                            >
                              x
                            </button>

                            {/* Name + role */}
                            <div className="text-xs font-bold text-cayo-burgundy truncate" title={empName}>
                              {empName}
                            </div>
                            {empRole && (
                              <div className="text-[10px] text-gray-400">
                                {ROLE_LABEL[empRole]}
                              </div>
                            )}

                            {/* Times - clickable to edit */}
                            <div className="mt-1 flex items-center justify-center gap-0.5 text-[11px] text-gray-600">
                              {editingShift?.id === shift.id && editingShift.field === 'start' ? (
                                <input
                                  type="time"
                                  autoFocus
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => saveTime(shift.id, 'start', editValue)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveTime(shift.id, 'start', editValue) }}
                                  className="w-[70px] text-[11px] px-1 py-0.5 border border-cayo-burgundy rounded text-center"
                                />
                              ) : (
                                <button
                                  onClick={() => { setEditingShift({ id: shift.id, field: 'start' }); setEditValue(startTime) }}
                                  className="hover:bg-cayo-burgundy/10 px-1 py-0.5 rounded transition-colors font-medium"
                                >
                                  {startTime}
                                </button>
                              )}
                              <span className="text-gray-300">-</span>
                              {editingShift?.id === shift.id && editingShift.field === 'end' ? (
                                <input
                                  type="time"
                                  autoFocus
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => saveTime(shift.id, 'end', editValue)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveTime(shift.id, 'end', editValue) }}
                                  className="w-[70px] text-[11px] px-1 py-0.5 border border-cayo-burgundy rounded text-center"
                                />
                              ) : (
                                <button
                                  onClick={() => { setEditingShift({ id: shift.id, field: 'end' }); setEditValue(endTime) }}
                                  className="hover:bg-cayo-burgundy/10 px-1 py-0.5 rounded transition-colors font-medium"
                                >
                                  {endTime}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Add employee button */}
                      {available.length > 0 && (
                        <div className="relative" ref={dropdownDay === date ? dropdownRef : undefined}>
                          <button
                            onClick={() => setDropdownDay(dropdownDay === date ? null : date)}
                            className="w-full py-1.5 border border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-cayo-burgundy hover:text-cayo-burgundy transition-colors text-sm flex items-center justify-center gap-1"
                          >
                            <span className="text-lg leading-none">+</span>
                          </button>

                          {dropdownDay === date && (
                            <div className="absolute top-full mt-1 right-0 left-0 z-30 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                              {available.map(emp => (
                                <button
                                  key={emp.id}
                                  onClick={() => addShift(date, emp.id)}
                                  className="w-full text-right px-3 py-2 text-xs hover:bg-cayo-burgundy/5 transition-colors border-b border-gray-100 last:border-0"
                                >
                                  <span className="font-medium text-gray-900">{emp.full_name}</span>
                                  <span className="text-gray-400 mr-1">({ROLE_LABEL[emp.role]})</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
