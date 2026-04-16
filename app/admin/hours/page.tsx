'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  bartender: 'ברמנים',
  waiter: 'מלצרים',
  host: 'מארחים',
  kitchen: 'מטבח',
  dishwasher: 'שוטפים',
  manager: 'אחמ"שים',
}

const ROLE_ORDER: Role[] = ['manager', 'bartender', 'waiter', 'host', 'kitchen', 'dishwasher']

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function calcHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let totalMin = (eh * 60 + em) - (sh * 60 + sm)
  if (totalMin < 0) totalMin += 24 * 60
  totalMin -= breakMin
  return Math.max(0, totalMin / 60)
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatHebDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = todayStr()

  const dayName = HEBREW_DAYS[date.getDay()]
  const label = `יום ${dayName}, ${d} ${HEBREW_MONTHS[m - 1]}`

  if (s === todayKey) return `היום · ${label}`
  return label
}

function shiftDateStr(dateStr: string, delta: number) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Row state per employee for a given day
interface RowState {
  worked: boolean
  start_time: string
  end_time: string
  break_minutes: number
  notes: string
  shiftId: string | null // null = not saved yet
  saving: boolean
  dirty: boolean
}

export default function HoursPage() {
  const { status } = useSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'daily' | 'summary'>('daily')
  const [month, setMonth] = useState(currentMonth())
  const [monthShifts, setMonthShifts] = useState<Shift[]>([])
  const [monthLoading, setMonthLoading] = useState(false)

  // Row states keyed by employee id
  const [rows, setRows] = useState<Record<string, RowState>>({})

  useEffect(() => {
    if (status === 'authenticated') fetchEmployees()
  }, [status])

  useEffect(() => {
    if (status === 'authenticated' && tab === 'daily') fetchDayShifts()
  }, [status, selectedDate, tab])

  useEffect(() => {
    if (status === 'authenticated' && tab === 'summary') fetchMonthShifts()
  }, [status, month, tab])

  async function fetchEmployees() {
    const res = await fetch('/api/employees')
    if (res.ok) {
      const data: Employee[] = await res.json()
      setEmployees(data.filter(e => e.active))
    }
  }

  async function fetchDayShifts() {
    setLoading(true)
    // Get the month of the selected date to fetch shifts
    const [y, m] = selectedDate.split('-')
    const res = await fetch(`/api/shifts?month=${y}-${m}`)
    const allShifts: Shift[] = res.ok ? await res.json() : []
    const dayShifts = allShifts.filter(s => s.date === selectedDate)
    setShifts(dayShifts)

    // Build row states
    const newRows: Record<string, RowState> = {}
    for (const emp of employees) {
      const existing = dayShifts.find(s => s.employee_id === emp.id)
      newRows[emp.id] = existing
        ? {
            worked: true,
            start_time: existing.start_time.slice(0, 5),
            end_time: existing.end_time.slice(0, 5),
            break_minutes: existing.break_minutes,
            notes: existing.notes || '',
            shiftId: existing.id,
            saving: false,
            dirty: false,
          }
        : {
            worked: false,
            start_time: '18:00',
            end_time: '02:00',
            break_minutes: 0,
            notes: '',
            shiftId: null,
            saving: false,
            dirty: false,
          }
    }
    setRows(newRows)
    setLoading(false)
  }

  async function fetchMonthShifts() {
    setMonthLoading(true)
    const res = await fetch(`/api/shifts?month=${month}`)
    if (res.ok) setMonthShifts(await res.json())
    setMonthLoading(false)
  }

  // When employees load and we're on daily tab, refresh rows
  useEffect(() => {
    if (employees.length > 0 && tab === 'daily') fetchDayShifts()
  }, [employees])

  function updateRow(empId: string, patch: Partial<RowState>) {
    setRows(prev => ({
      ...prev,
      [empId]: { ...prev[empId], ...patch, dirty: true },
    }))
  }

  const saveRow = useCallback(async (empId: string) => {
    const row = rows[empId]
    if (!row || row.saving) return

    setRows(prev => ({ ...prev, [empId]: { ...prev[empId], saving: true } }))

    if (row.worked) {
      const payload = {
        employee_id: empId,
        date: selectedDate,
        start_time: row.start_time,
        end_time: row.end_time,
        break_minutes: row.break_minutes,
        notes: row.notes || undefined,
      }

      if (row.shiftId) {
        // Update existing
        await fetch(`/api/shifts/${row.shiftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        // Create new
        const res = await fetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const data = await res.json()
          setRows(prev => ({
            ...prev,
            [empId]: { ...prev[empId], shiftId: data.id, saving: false, dirty: false },
          }))
          return
        }
      }
    } else {
      // Remove shift if unchecked
      if (row.shiftId) {
        await fetch(`/api/shifts/${row.shiftId}`, { method: 'DELETE' })
        setRows(prev => ({
          ...prev,
          [empId]: { ...prev[empId], shiftId: null, saving: false, dirty: false },
        }))
        return
      }
    }

    setRows(prev => ({ ...prev, [empId]: { ...prev[empId], saving: false, dirty: false } }))
  }, [rows, selectedDate])

  // Group employees by role
  const grouped = useMemo(() => {
    const map = new Map<Role, Employee[]>()
    for (const role of ROLE_ORDER) {
      const emps = employees.filter(e => e.role === role)
      if (emps.length > 0) map.set(role, emps)
    }
    return map
  }, [employees])

  // Monthly summary
  const summary = useMemo(() => {
    const map = new Map<string, { name: string; role: Role; rate: number; totalHours: number; totalPay: number; shiftCount: number }>()
    for (const s of monthShifts) {
      const emp = s.employees
      if (!emp) continue
      const existing = map.get(s.employee_id) || {
        name: emp.full_name,
        role: emp.role,
        rate: emp.hourly_rate,
        totalHours: 0,
        totalPay: 0,
        shiftCount: 0,
      }
      const hours = calcHours(s.start_time, s.end_time, s.break_minutes)
      existing.totalHours += hours
      existing.totalPay += hours * emp.hourly_rate
      existing.shiftCount += 1
      map.set(s.employee_id, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours)
  }, [monthShifts])

  const grandTotalHours = summary.reduce((s, e) => s + e.totalHours, 0)
  const grandTotalPay = summary.reduce((s, e) => s + e.totalPay, 0)

  function monthLabel(m: string) {
    const [y, mo] = m.split('-').map(Number)
    return `${HEBREW_MONTHS[mo - 1]} ${y}`
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
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
          יש להתחבר דרך <Link href="/admin" className="text-cayo-burgundy underline">עמוד הניהול</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-cayo-burgundy">שעות עבודה</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/employees" className="text-sm text-cayo-burgundy hover:underline">
              ניהול עובדים
            </Link>
            <a
              href={`/api/shifts/export?month=${tab === 'summary' ? month : selectedDate.slice(0, 7)}`}
              className="px-3 py-1.5 border border-cayo-burgundy text-cayo-burgundy text-sm font-bold rounded-lg hover:bg-cayo-burgundy/5 transition-colors"
            >
              ייצוא CSV
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex bg-white border border-gray-200 rounded-lg">
            <button
              onClick={() => setTab('daily')}
              className={`px-5 py-2 text-sm font-medium rounded-r-lg transition-colors ${tab === 'daily' ? 'bg-cayo-burgundy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              תצוגת יום
            </button>
            <button
              onClick={() => setTab('summary')}
              className={`px-5 py-2 text-sm font-medium rounded-l-lg transition-colors ${tab === 'summary' ? 'bg-cayo-burgundy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              סיכום חודשי
            </button>
          </div>
        </div>

        {tab === 'daily' ? (
          <>
            {/* Date navigation */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg">
                <button onClick={() => setSelectedDate(shiftDateStr(selectedDate, 1))} className="px-3 py-2 hover:bg-gray-50 rounded-r-lg text-gray-600 text-lg">&rarr;</button>
                <span className="px-4 py-2 text-sm font-medium text-gray-700 min-w-[180px] text-center">
                  {formatHebDate(selectedDate)}
                </span>
                <button onClick={() => setSelectedDate(shiftDateStr(selectedDate, -1))} className="px-3 py-2 hover:bg-gray-50 rounded-l-lg text-gray-600 text-lg">&larr;</button>
              </div>
              <button
                onClick={() => setSelectedDate(todayStr())}
                className="px-3 py-2 text-sm text-cayo-burgundy hover:underline"
              >
                היום
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">
                {Array.from(grouped.entries()).map(([role, emps]) => (
                  <div key={role} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Role header */}
                    <div className="bg-cayo-burgundy/5 border-b border-gray-200 px-4 py-2.5">
                      <h3 className="text-sm font-bold text-cayo-burgundy">{ROLE_LABEL[role]}</h3>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {emps.map(emp => {
                        const row = rows[emp.id]
                        if (!row) return null
                        const hours = row.worked ? calcHours(row.start_time, row.end_time, row.break_minutes) : 0
                        const pay = hours * emp.hourly_rate

                        return (
                          <div key={emp.id} className={`px-4 py-3 transition-colors ${row.worked ? 'bg-white' : 'bg-gray-50/50'}`}>
                            <div className="flex items-center gap-4">
                              {/* Checkbox + name */}
                              <label className="flex items-center gap-3 min-w-[160px] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={row.worked}
                                  onChange={e => {
                                    updateRow(emp.id, { worked: e.target.checked })
                                    // Auto-save on uncheck (delete shift)
                                    if (!e.target.checked && row.shiftId) {
                                      setTimeout(() => saveRow(emp.id), 100)
                                    }
                                  }}
                                  className="w-5 h-5 rounded border-gray-300 text-cayo-burgundy focus:ring-cayo-burgundy/30"
                                />
                                <span className={`text-sm font-medium ${row.worked ? 'text-gray-900' : 'text-gray-400'}`}>
                                  {emp.full_name}
                                </span>
                              </label>

                              {row.worked && (
                                <>
                                  {/* Start time */}
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-400">מ-</span>
                                    <input
                                      type="time"
                                      value={row.start_time}
                                      onChange={e => updateRow(emp.id, { start_time: e.target.value })}
                                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-[100px] focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                                    />
                                  </div>

                                  {/* End time */}
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-400">עד</span>
                                    <input
                                      type="time"
                                      value={row.end_time}
                                      onChange={e => updateRow(emp.id, { end_time: e.target.value })}
                                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-[100px] focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                                    />
                                  </div>

                                  {/* Break */}
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-400">הפסקה</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={row.break_minutes}
                                      onChange={e => updateRow(emp.id, { break_minutes: parseInt(e.target.value) || 0 })}
                                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-[60px] focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                                    />
                                    <span className="text-xs text-gray-400">ד׳</span>
                                  </div>

                                  {/* Hours display */}
                                  <div className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
                                    {hours.toFixed(1)} ש׳
                                  </div>

                                  {/* Pay display */}
                                  {emp.hourly_rate > 0 && (
                                    <div className="text-sm font-medium text-cayo-burgundy min-w-[60px] text-center">
                                      ₪{pay.toFixed(0)}
                                    </div>
                                  )}

                                  {/* Save button */}
                                  <button
                                    onClick={() => saveRow(emp.id)}
                                    disabled={row.saving || !row.dirty}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                                      row.dirty
                                        ? 'bg-cayo-burgundy text-white hover:bg-cayo-burgundy/90'
                                        : 'bg-gray-100 text-gray-400'
                                    } disabled:opacity-50`}
                                  >
                                    {row.saving ? '...' : row.dirty ? 'שמור' : 'נשמר'}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {employees.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    אין עובדים פעילים. <Link href="/admin/employees" className="text-cayo-burgundy underline">הוסף עובדים</Link>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Monthly summary */
          <>
            {/* Month navigation */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg">
                <button onClick={() => shiftMonth(-1)} className="px-3 py-2 hover:bg-gray-50 rounded-r-lg text-gray-600">&rarr;</button>
                <span className="px-4 py-2 text-sm font-medium text-gray-700 min-w-[140px] text-center">{monthLabel(month)}</span>
                <button onClick={() => shiftMonth(1)} className="px-3 py-2 hover:bg-gray-50 rounded-l-lg text-gray-600">&larr;</button>
              </div>
            </div>

            {monthLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Stats cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">סה&quot;כ משמרות</p>
                    <p className="text-2xl font-bold text-cayo-burgundy">{monthShifts.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">סה&quot;כ שעות</p>
                    <p className="text-2xl font-bold text-cayo-burgundy">{grandTotalHours.toFixed(1)}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 mb-1">סה&quot;כ שכר</p>
                    <p className="text-2xl font-bold text-cayo-burgundy">₪{grandTotalPay.toFixed(0)}</p>
                  </div>
                </div>

                {/* Per-employee table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-right px-4 py-3 font-semibold text-gray-700">עובד</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-700">תפקיד</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-700">משמרות</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-700">שעות</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-700">שכר שעתי</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-700">סה&quot;כ שכר</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center py-12 text-gray-400">{"אין נתונים לחודש זה"}</td>
                          </tr>
                        )}
                        {summary.map((e, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cayo-burgundy/10 text-cayo-burgundy">
                                {ROLE_LABEL[e.role]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{e.shiftCount}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{e.totalHours.toFixed(1)}</td>
                            <td className="px-4 py-3 text-gray-600">{"₪"}{e.rate}</td>
                            <td className="px-4 py-3 font-bold text-cayo-burgundy">{"₪"}{e.totalPay.toFixed(0)}</td>
                          </tr>
                        ))}
                        {summary.length > 0 && (
                          <tr className="bg-gray-50 font-bold">
                            <td className="px-4 py-3 text-gray-900" colSpan={3}>{"סה\"\u05DB סה\"\u05DB"}</td>
                            <td className="px-4 py-3 text-gray-900">{grandTotalHours.toFixed(1)}</td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 text-cayo-burgundy">{"₪"}{grandTotalPay.toFixed(0)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
