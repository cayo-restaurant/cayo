
'use client'

import { useEffect, useMemo, useState } from 'react'
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
  manager: '\u05d0\u05d7\u05de"\u05e9',
  bartender: '\u05d1\u05e8',
  waiter: '\u05de\u05dc\u05e6\u05e8\u05d9\u05dd',
  host: '\u05de\u05d0\u05e8\u05d7\u05ea',
  kitchen: '\u05de\u05d8\u05d1\u05d7',
  dishwasher: '\u05e9\u05d8\u05d9\u05e4\u05d4',
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
const DEFAULT_SLOTS: Record<Role, number> = {
  manager: 1, bartender: 4, waiter: 4, host: 2, kitchen: 4, dishwasher: 2,
}

const HEBREW_DAYS = ['\u05e8\u05d0\u05e9\u05d5\u05df', '\u05e9\u05e0\u05d9', '\u05e9\u05dc\u05d9\u05e9\u05d9', '\u05e8\u05d1\u05d9\u05e2\u05d9', '\u05d7\u05de\u05d9\u05e9\u05d9', '\u05e9\u05d9\u05e9\u05d9', '\u05e9\u05d1\u05ea']
const HEBREW_MONTHS = ['\u05d9\u05e0\u05d5\u05d0\u05e8', '\u05e4\u05d1\u05e8\u05d5\u05d0\u05e8', '\u05de\u05e8\u05e5', '\u05d0\u05e4\u05e8\u05d9\u05dc', '\u05de\u05d0\u05d9', '\u05d9\u05d5\u05e0\u05d9', '\u05d9\u05d5\u05dc\u05d9', '\u05d0\u05d5\u05d2\u05d5\u05e1\u05d8', '\u05e1\u05e4\u05d8\u05de\u05d1\u05e8', '\u05d0\u05d5\u05e7\u05d8\u05d5\u05d1\u05e8', '\u05e0\u05d5\u05d1\u05de\u05d1\u05e8', '\u05d3\u05e6\u05de\u05d1\u05e8']

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
  const [shifts, setShifts] = useState<Shift[]>([])
  const [anchor, setAnchor] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [extraSlots, setExtraSlots] = useState<Record<string, number>>({})

  const [editModal, setEditModal] = useState<{
    shiftId: string
    empName: string
    date: string
    start: string
    end: string
    breakMin: number
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const dates = useMemo(() => weekDates(anchor), [anchor])
  const today = todayStr()

  const shiftsByDateRole = useMemo(() => {
    const map: Record<string, Shift[]> = {}
    for (const s of shifts) {
      const key = `${s.date}_${s.employees?.role || ''}`
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return map
  }, [shifts])

  useEffect(() => {
    const newExtra: Record<string, number> = {}
    for (const date of dates) {
      for (const role of ROLE_ORDER) {
        const key = `${date}_${role}`
        const filled = (shiftsByDateRole[key] || []).length
        const def = DEFAULT_SLOTS[role]
        newExtra[key] = Math.max(def - filled, 1)
      }
    }
    setExtraSlots(newExtra)
  }, [dates, shiftsByDateRole])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchEmployees()
      fetchWeekShifts()
    }
  }, [status])

  useEffect(() => {
    if (status === 'authenticated') fetchWeekShifts()
  }, [anchor])

  async function fetchEmployees() {
    const res = await fetch('/api/employees')
    if (res.ok) {
      const data: Employee[] = await res.json()
      setEmployees(data.filter(e => e.active))
    }
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

  async function addShift(date: string, empId: string) {
    setOpenDropdown(null)
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
    if (res.ok || res.status === 409) await fetchWeekShifts()
  }

  async function removeShift(shiftId: string) {
    await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE' })
    await fetchWeekShifts()
  }

  function openTimeEdit(shift: Shift) {
    setEditModal({
      shiftId: shift.id,
      empName: shift.employees?.full_name || '',
      date: shift.date,
      start: shift.start_time.slice(0, 5),
      end: shift.end_time.slice(0, 5),
      breakMin: shift.break_minutes,
    })
  }

  async function saveTime() {
    if (!editModal) return
    setSaving(true)
    const shift = shifts.find(s => s.id === editModal.shiftId)
    if (shift) {
      await fetch(`/api/shifts/${editModal.shiftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: shift.employee_id,
          date: shift.date,
          start_time: editModal.start,
          end_time: editModal.end,
          break_minutes: editModal.breakMin,
        }),
      })
    }
    setSaving(false)
    setEditModal(null)
    await fetchWeekShifts()
  }

  function addEmptySlot(role: Role) {
    setExtraSlots(prev => {
      const next = { ...prev }
      for (const date of dates) {
        const key = `${date}_${role}`
        next[key] = (next[key] || 0) + 1
      }
      return next
    })
  }

  function removeEmptySlot(role: Role) {
    setExtraSlots(prev => {
      const next = { ...prev }
      for (const date of dates) {
        const key = `${date}_${role}`
        if ((next[key] || 0) > 0) next[key] = (next[key] || 0) - 1
      }
      return next
    })
  }

  function availableForSlot(date: string, role: Role): Employee[] {
    const dayShifts = shifts.filter(s => s.date === date)
    const assignedIds = new Set(dayShifts.map(s => s.employee_id))
    return employees.filter(e => e.role === role && !assignedIds.has(e.id))
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
          {"\u05d9\u05e9 \u05dc\u05d4\u05ea\u05d7\u05d1\u05e8 \u05d3\u05e8\u05da "}
          <Link href="/admin" className="text-cayo-burgundy underline">{"\u05e2\u05de\u05d5\u05d3 \u05d4\u05e0\u05d9\u05d4\u05d5\u05dc"}</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-cayo-burgundy">{"\u05e9\u05e2\u05d5\u05ea \u05e2\u05d1\u05d5\u05d3\u05d4"}</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/employees" className="text-sm text-cayo-burgundy hover:underline">{"\u05e0\u05d9\u05d4\u05d5\u05dc \u05e2\u05d5\u05d1\u05d3\u05d9\u05dd"}</Link>
            <a href={`/api/shifts/export?month=${dates[0].slice(0, 7)}`} className="px-3 py-1.5 border border-cayo-burgundy text-cayo-burgundy text-sm font-bold rounded-lg hover:bg-cayo-burgundy/5 transition-colors">{"\u05d9\u05d9\u05e6\u05d5\u05d0 CSV"}</a>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Week nav */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg">
            <button onClick={() => setAnchor(shiftWeek(anchor, 1))} className="px-3 py-2 hover:bg-gray-50 rounded-r-lg text-gray-600">&rarr;</button>
            <span className="px-5 py-2 text-sm font-medium text-gray-700 min-w-[200px] text-center">{weekLabel(dates)}</span>
            <button onClick={() => setAnchor(shiftWeek(anchor, -1))} className="px-3 py-2 hover:bg-gray-50 rounded-l-lg text-gray-600">&larr;</button>
          </div>
          <button onClick={() => setAnchor(todayStr())} className="px-3 py-2 text-sm text-cayo-burgundy hover:underline">{"\u05d4\u05e9\u05d1\u05d5\u05e2"}</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            {/* Sticky day headers */}
            <div className="grid grid-cols-7 sticky top-0 z-10 bg-white border-b-2 border-gray-200">
              {dates.map((date, i) => {
                const [, mo, da] = date.split('-').map(Number)
                const isToday = date === today
                return (
                  <div key={date} className={`px-2 py-3 text-center ${i > 0 ? 'border-r border-gray-200' : ''} ${isToday ? 'bg-cayo-burgundy text-white' : 'bg-gray-50'}`}>
                    <div className={`text-xs font-bold ${isToday ? 'text-white/70' : 'text-gray-400'}`}>{HEBREW_DAYS[i]}</div>
                    <div className="text-lg font-bold">{da}</div>
                    <div className={`text-[10px] ${isToday ? 'text-white/50' : 'text-gray-400'}`}>{HEBREW_MONTHS[mo - 1]}</div>
                  </div>
                )
              })}
            </div>

            {/* Role sections */}
            {ROLE_ORDER.map(role => {
              const maxSlots = Math.max(
                ...dates.map(date => {
                  const filled = (shiftsByDateRole[`${date}_${role}`] || []).length
                  const extra = extraSlots[`${date}_${role}`] || 0
                  return filled + extra
                }),
                1
              )

              return (
                <div key={role}>
                  {/* Full-width role header bar */}
                  <div className={`flex items-center justify-between px-4 py-2 border-b border-t ${ROLE_HEADER_COLOR[role]}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{ROLE_LABEL[role]}</span>
                      <span className="text-xs opacity-60">({maxSlots} {"\u05de\u05e9\u05d1\u05e6\u05d5\u05ea"})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => removeEmptySlot(role)}
                        className="w-7 h-7 rounded-lg bg-white/80 hover:bg-red-100 border border-current/20 text-current font-bold text-base flex items-center justify-center transition-colors"
                        title={"\u05d4\u05e1\u05e8 \u05de\u05e9\u05d1\u05e6\u05ea"}
                      >-</button>
                      <button
                        onClick={() => addEmptySlot(role)}
                        className="w-7 h-7 rounded-lg bg-white/80 hover:bg-green-100 border border-current/20 text-current font-bold text-base flex items-center justify-center transition-colors"
                        title={"\u05d4\u05d5\u05e1\u05e3 \u05de\u05e9\u05d1\u05e6\u05ea"}
                      >+</button>
                    </div>
                  </div>

                  {/* Slot rows - no label column needed */}
                  {Array.from({ length: maxSlots }, (_, slotIdx) => (
                    <div key={slotIdx} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                      {dates.map((date, colIdx) => {
                        const dayRoleShifts = shiftsByDateRole[`${date}_${role}`] || []
                        const shift = dayRoleShifts[slotIdx]
                        const isToday = date === today
                        const dropdownKey = `${date}_${role}_${slotIdx}`
                        const available = availableForSlot(date, role)

                        return (
                          <div key={date} className={`${colIdx > 0 ? 'border-r border-gray-200' : ''} px-1.5 py-1 min-h-[48px] relative ${isToday ? 'bg-cayo-burgundy/[0.03]' : ''}`}>
                            {shift ? (
                              <div className={`group rounded-lg border px-2 py-1.5 ${ROLE_CELL_COLOR[role]} text-xs cursor-pointer transition-shadow hover:shadow-sm`} onClick={() => openTimeEdit(shift)}>
                                <div className="flex items-center justify-between">
                                  <span className="font-bold truncate">{shift.employees?.full_name}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removeShift(shift.id) }}
                                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 font-bold text-sm mr-1 transition-opacity"
                                  >&times;</button>
                                </div>
                                <div className="text-[10px] opacity-60 mt-0.5">
                                  {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                                </div>
                              </div>
                            ) : slotIdx < (dayRoleShifts.length + (extraSlots[`${date}_${role}`] || 0)) ? (
                              <div className="relative h-full">
                                <button
                                  onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)}
                                  className="w-full h-[40px] border-2 border-dashed border-gray-200 rounded-lg hover:border-cayo-burgundy/30 hover:bg-cayo-burgundy/[0.02] transition-all flex items-center justify-center"
                                >
                                  <span className="text-gray-300 text-lg">+</span>
                                </button>
                                {openDropdown === dropdownKey && (
                                  <div className="absolute top-full mt-1 right-0 z-30 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[160px] max-h-[200px] overflow-y-auto">
                                    {available.length === 0 ? (
                                      <div className="px-3 py-2 text-xs text-gray-400">{"\u05d0\u05d9\u05df \u05e2\u05d5\u05d1\u05d3\u05d9\u05dd \u05d6\u05de\u05d9\u05e0\u05d9\u05dd"}</div>
                                    ) : (
                                      available.map(emp => (
                                        <button key={emp.id} onClick={() => addShift(date, emp.id)} className="w-full text-right px-3 py-2.5 text-xs font-medium hover:bg-cayo-burgundy/5 transition-colors border-b border-gray-100 last:border-0">
                                          {emp.full_name}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Time edit modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-[340px] p-5" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-cayo-burgundy">{"\u05e2\u05e8\u05d9\u05db\u05ea \u05e9\u05e2\u05d5\u05ea"}</h3>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{editModal.empName}</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-16">{"\u05d4\u05ea\u05d7\u05dc\u05d4"}</label>
                <input type="time" value={editModal.start} onChange={e => setEditModal({ ...editModal, start: e.target.value })} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-16">{"\u05e1\u05d9\u05d5\u05dd"}</label>
                <input type="time" value={editModal.end} onChange={e => setEditModal({ ...editModal, end: e.target.value })} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-16">{"\u05d4\u05e4\u05e1\u05e7\u05d4"}</label>
                <input type="number" min="0" value={editModal.breakMin} onChange={e => setEditModal({ ...editModal, breakMin: parseInt(e.target.value) || 0 })} className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy" />
                <span className="text-xs text-gray-400">{"\u05d3\u05e7'"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={saveTime} disabled={saving} className="flex-1 py-2.5 bg-cayo-burgundy text-white text-sm font-bold rounded-lg hover:bg-cayo-burgundy/90 transition-colors disabled:opacity-50">
                {saving ? '...' : '\u05e9\u05de\u05d5\u05e8'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
