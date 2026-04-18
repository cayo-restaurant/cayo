'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Role = 'bartender' | 'waiter' | 'host' | 'kitchen' | 'dishwasher' | 'manager'

interface Employee {
  id: string
  full_name: string
  role: Role
  // Extra roles the employee is qualified for. Used to expand the "add to
  // slot" dropdown so a waiter with bartender-secondary can be scheduled as
  // a bartender on a given day. Display color/grouping is still driven by
  // `role` (primary).
  secondary_roles: Role[]
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

interface TipRow {
  name: string
  role: string
  start: string
  end: string
  hours: number
  cashTip: number
  creditTip: number
  supplement: number
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
const TIP_ROLES: Role[] = ['waiter', 'bartender']
const MIN_HOURLY = 45

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

function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  return toStr(date)
}

function dayLabel(dateStr: string): string {
  const [y, mo, da] = dateStr.split('-').map(Number)
  const dow = new Date(y, mo - 1, da).getDay()
  return `${HEBREW_DAYS[dow]} ${da} ${HEBREW_MONTHS[mo - 1]}`
}

function calcShiftHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let startMins = sh * 60 + sm
  let endMins = eh * 60 + em
  if (endMins <= startMins) endMins += 24 * 60
  return Math.max((endMins - startMins - breakMin) / 60, 0)
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

  // Tip calculator state
  const [tipOpen, setTipOpen] = useState(false)
  const [tipDate, setTipDate] = useState(todayStr())
  const [tipCash, setTipCash] = useState('')
  const [tipCredit, setTipCredit] = useState('')
  const [tipResults, setTipResults] = useState<TipRow[] | null>(null)

  // Mobile daily view state
  const [mobileDay, setMobileDay] = useState(todayStr())
  const [inlineEdit, setInlineEdit] = useState<Record<string, { start: string; end: string; breakMin: number }>>({})
  const [mobileDrop, setMobileDrop] = useState<string | null>(null)

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

  // Sync mobile day with week anchor
  useEffect(() => {
    if (!dates.includes(mobileDay)) {
      setAnchor(mobileDay)
    }
  }, [mobileDay])

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
    setMobileDrop(null)
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

  function addSlotForDay(date: string, role: Role) {
    const key = `${date}_${role}`
    setExtraSlots(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }))
  }

  function removeSlotForDay(date: string, role: Role) {
    const key = `${date}_${role}`
    setExtraSlots(prev => ({ ...prev, [key]: Math.max((prev[key] || 0) - 1, 0) }))
  }

  function availableForSlot(date: string, role: Role): Employee[] {
    const dayShifts = shifts.filter(s => s.date === date)
    const assignedIds = new Set(dayShifts.map(s => s.employee_id))
    // Primary-role matches come first, then secondary-role matches, so the
    // dropdown always shows "real" candidates before backup fills.
    const primary: Employee[] = []
    const secondary: Employee[] = []
    for (const e of employees) {
      if (assignedIds.has(e.id)) continue
      if (e.role === role) primary.push(e)
      else if ((e.secondary_roles || []).includes(role)) secondary.push(e)
    }
    return [...primary, ...secondary]
  }

  // Mobile inline edit functions
  function startInlineEdit(shift: Shift) {
    setInlineEdit(prev => ({
      ...prev,
      [shift.id]: {
        start: shift.start_time.slice(0, 5),
        end: shift.end_time.slice(0, 5),
        breakMin: shift.break_minutes,
      },
    }))
  }

  function cancelInlineEdit(shiftId: string) {
    setInlineEdit(prev => {
      const next = { ...prev }
      delete next[shiftId]
      return next
    })
  }

  async function saveInlineEdit(shiftId: string) {
    const edit = inlineEdit[shiftId]
    if (!edit) return
    const shift = shifts.find(s => s.id === shiftId)
    if (!shift) return
    setSaving(true)
    await fetch(`/api/shifts/${shiftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: shift.employee_id,
        date: shift.date,
        start_time: edit.start,
        end_time: edit.end,
        break_minutes: edit.breakMin,
      }),
    })
    cancelInlineEdit(shiftId)
    setSaving(false)
    await fetchWeekShifts()
  }

  // Tip calculation
  function calculateTips() {
    const cashTotal = parseFloat(tipCash) || 0
    const creditTotal = parseFloat(tipCredit) || 0

    const dayTipShifts = shifts.filter(
      s => s.date === tipDate && s.employees && TIP_ROLES.includes(s.employees.role as Role)
    )

    if (dayTipShifts.length === 0) {
      setTipResults([])
      return
    }

    const numWorkers = dayTipShifts.length
    const cashPerPerson = cashTotal / numWorkers
    const creditPerPerson = creditTotal / numWorkers
    const totalPerPerson = cashPerPerson + creditPerPerson

    const rows: TipRow[] = dayTipShifts.map(s => {
      const hours = calcShiftHours(s.start_time, s.end_time, s.break_minutes)
      const hourlyRate = hours > 0 ? totalPerPerson / hours : 0
      const supplement = hourlyRate < MIN_HOURLY && hours > 0
        ? (MIN_HOURLY * hours) - totalPerPerson
        : 0

      return {
        name: s.employees?.full_name || '',
        role: ROLE_LABEL[(s.employees?.role as Role) || 'waiter'],
        start: s.start_time.slice(0, 5),
        end: s.end_time.slice(0, 5),
        hours: Math.round(hours * 100) / 100,
        cashTip: Math.round(cashPerPerson),
        creditTip: Math.round(creditPerPerson),
        supplement: Math.round(supplement),
      }
    })

    setTipResults(rows)
  }

  function tipDateLabel(date: string): string {
    const [, mo, da] = date.split('-').map(Number)
    const dow = new Date(parseInt(date.slice(0, 4)), mo - 1, da).getDay()
    return `${HEBREW_DAYS[dow]} ${da}/${mo}`
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

  const totalSupplement = tipResults ? tipResults.reduce((sum, r) => sum + r.supplement, 0) : 0
  const mobileDayShifts = shifts.filter(s => s.date === mobileDay)

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-cayo-burgundy">{"\u05e9\u05e2\u05d5\u05ea \u05e2\u05d1\u05d5\u05d3\u05d4"}</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/employees" className="text-sm text-cayo-burgundy hover:underline">{"\u05e0\u05d9\u05d4\u05d5\u05dc \u05e2\u05d5\u05d1\u05d3\u05d9\u05dd"}</Link>
            <a href={`/api/shifts/export?month=${dates[0].slice(0, 7)}`} className="hidden sm:inline-block px-3 py-1.5 border border-cayo-burgundy text-cayo-burgundy text-sm font-bold rounded-lg hover:bg-cayo-burgundy/5 transition-colors">{"\u05d9\u05d9\u05e6\u05d5\u05d0 CSV"}</a>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">

        {/* ===== DESKTOP: Week nav ===== */}
        <div className="hidden md:flex items-center gap-3 mb-5">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg">
            <button onClick={() => setAnchor(shiftWeek(anchor, 1))} className="px-3 py-2 hover:bg-gray-50 rounded-r-lg text-gray-600">{"\u2192"}</button>
            <span className="px-5 py-2 text-sm font-medium text-gray-700 min-w-[200px] text-center">{weekLabel(dates)}</span>
            <button onClick={() => setAnchor(shiftWeek(anchor, -1))} className="px-3 py-2 hover:bg-gray-50 rounded-l-lg text-gray-600">{"\u2190"}</button>
          </div>
          <button onClick={() => setAnchor(todayStr())} className="px-3 py-2 text-sm text-cayo-burgundy hover:underline">{"\u05d4\u05e9\u05d1\u05d5\u05e2"}</button>
        </div>

        {/* ===== MOBILE: Day nav card ===== */}
        <div className="md:hidden mb-4">
          <div className="bg-cayo-burgundy rounded-xl p-4 flex items-center justify-between text-white">
            <button onClick={() => setMobileDay(shiftDay(mobileDay, 1))} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <span className="text-xl">{"\u2192"}</span>
            </button>
            <div className="text-center">
              <div className="text-lg font-bold">{dayLabel(mobileDay)}</div>
              {mobileDay !== today && (
                <button onClick={() => setMobileDay(todayStr())} className="text-xs text-white/70 hover:text-white underline mt-1">{"\u05d4\u05d9\u05d5\u05dd"}</button>
              )}
            </div>
            <button onClick={() => setMobileDay(shiftDay(mobileDay, -1))} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <span className="text-xl">{"\u2190"}</span>
            </button>
          </div>
        </div>

        {/* ===== TIP CALCULATOR (both views) ===== */}
        <div className="bg-white rounded-xl border border-gray-200 mb-5 overflow-hidden">
          <button
            onClick={() => { setTipOpen(!tipOpen); setTipResults(null) }}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-cayo-burgundy">{"\u05d7\u05d9\u05e9\u05d5\u05d1 \u05d8\u05d9\u05e4\u05d9\u05dd"}</span>
              <span className="text-xs text-gray-400">{"\u05de\u05dc\u05e6\u05e8\u05d9\u05dd + \u05d1\u05e8"}</span>
            </div>
            <span className={`text-gray-400 transition-transform ${tipOpen ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>

          {tipOpen && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <div className="flex flex-wrap items-end gap-4 mt-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{"\u05d9\u05d5\u05dd"}</label>
                  <div className="flex gap-1 flex-wrap">
                    {dates.map(date => {
                      const [, , da] = date.split('-').map(Number)
                      const dow = new Date(parseInt(date.slice(0, 4)), parseInt(date.slice(5, 7)) - 1, da).getDay()
                      const isSelected = date === tipDate
                      return (
                        <button
                          key={date}
                          onClick={() => { setTipDate(date); setTipResults(null) }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-cayo-burgundy text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <div>{HEBREW_DAYS[dow]}</div>
                          <div className="font-bold">{da}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{"\u05e1\u05d4\"\u05db \u05d8\u05d9\u05e4 \u05de\u05d6\u05d5\u05de\u05df"}</label>
                  <input type="number" min="0" value={tipCash} onChange={e => { setTipCash(e.target.value); setTipResults(null) }} placeholder="0" className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{"\u05e1\u05d4\"\u05db \u05d8\u05d9\u05e4 \u05d0\u05e9\u05e8\u05d0\u05d9"}</label>
                  <input type="number" min="0" value={tipCredit} onChange={e => { setTipCredit(e.target.value); setTipResults(null) }} placeholder="0" className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy" />
                </div>
                <button onClick={calculateTips} className="px-5 py-2 bg-cayo-burgundy text-white text-sm font-bold rounded-lg hover:bg-cayo-burgundy/90 transition-colors">{"\u05d7\u05e9\u05d1"}</button>
              </div>

              {tipResults !== null && (
                <div className="mt-5">
                  {tipResults.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">{"\u05d0\u05d9\u05df \u05de\u05e9\u05de\u05e8\u05d5\u05ea \u05de\u05dc\u05e6\u05e8\u05d9\u05dd/\u05d1\u05e8 \u05d1\u05d9\u05d5\u05dd \u05d4\u05d6\u05d4"}</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-gray-600">
                              <th className="px-3 py-2 text-right font-bold">{"\u05e9\u05dd \u05e2\u05d5\u05d1\u05d3"}</th>
                              <th className="px-3 py-2 text-right font-bold">{"\u05ea\u05e4\u05e7\u05d9\u05d3"}</th>
                              <th className="px-3 py-2 text-center font-bold">{"\u05db\u05e0\u05d9\u05e1\u05d4"}</th>
                              <th className="px-3 py-2 text-center font-bold">{"\u05d9\u05e6\u05d9\u05d0\u05d4"}</th>
                              <th className="px-3 py-2 text-center font-bold">{"\u05e9\u05e2\u05d5\u05ea"}</th>
                              <th className="px-3 py-2 text-center font-bold">{"\u05d8\u05d9\u05e4 \u05de\u05d6\u05d5\u05de\u05df"}</th>
                              <th className="px-3 py-2 text-center font-bold">{"\u05d8\u05d9\u05e4 \u05d0\u05e9\u05e8\u05d0\u05d9"}</th>
                              <th className="px-3 py-2 text-center font-bold">{"\u05d4\u05e9\u05dc\u05de\u05d4"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tipResults.map((row, i) => (
                              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium">{row.name}</td>
                                <td className="px-3 py-2.5 text-gray-500">{row.role}</td>
                                <td className="px-3 py-2.5 text-center">{row.start}</td>
                                <td className="px-3 py-2.5 text-center">{row.end}</td>
                                <td className="px-3 py-2.5 text-center">{row.hours}</td>
                                <td className="px-3 py-2.5 text-center font-medium text-green-700">{row.cashTip} {"\u20aa"}</td>
                                <td className="px-3 py-2.5 text-center font-medium text-blue-700">{row.creditTip} {"\u20aa"}</td>
                                <td className="px-3 py-2.5 text-center font-medium">
                                  {row.supplement > 0 ? (
                                    <span className="text-red-600">{row.supplement} {"\u20aa"}</span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-center gap-6 mt-3 px-1 text-sm">
                        <span className="text-gray-500">
                          {"\u05e1\u05d4\"\u05db \u05d8\u05d9\u05e4\u05d9\u05dd: "}
                          <span className="font-bold text-gray-800">{(parseFloat(tipCash) || 0) + (parseFloat(tipCredit) || 0)} {"\u20aa"}</span>
                        </span>
                        <span className="text-gray-500">
                          {"\u05dc\u05e2\u05d5\u05d1\u05d3: "}
                          <span className="font-bold text-gray-800">{tipResults.length}</span>
                        </span>
                        {totalSupplement > 0 && (
                          <span className="text-red-600 font-bold">
                            {"\u05e1\u05d4\"\u05db \u05d4\u05e9\u05dc\u05de\u05d5\u05ea: "}{totalSupplement} {"\u20aa"}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== MOBILE: Daily view ===== */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            ROLE_ORDER.map(role => {
              const roleShifts = mobileDayShifts.filter(s => s.employees?.role === role)
              const available = availableForSlot(mobileDay, role)
              const dropKey = `mob_${role}`
              const slotKey = `${mobileDay}_${role}`
              const totalSlots = roleShifts.length + (extraSlots[slotKey] || 0)
              const emptySlots = Math.max(totalSlots - roleShifts.length, 0)

              return (
                <div key={role} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Role header */}
                  <div className={`px-4 py-2.5 border-b flex items-center justify-between ${ROLE_HEADER_COLOR[role]}`}>
                    <span className="font-bold text-sm">{ROLE_LABEL[role]}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeSlotForDay(mobileDay, role)} className="w-6 h-6 rounded bg-white/50 hover:bg-white text-xs font-bold flex items-center justify-center">-</button>
                      <span className="text-xs font-medium">{totalSlots}</span>
                      <button onClick={() => addSlotForDay(mobileDay, role)} className="w-6 h-6 rounded bg-white/50 hover:bg-white text-xs font-bold flex items-center justify-center">+</button>
                    </div>
                  </div>

                  {/* Assigned employees */}
                  <div className="divide-y divide-gray-100">
                    {roleShifts.map(shift => {
                      const editing = inlineEdit[shift.id]
                      return (
                        <div key={shift.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{shift.employees?.full_name}</span>
                              <span className="text-xs text-gray-400">
                                {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {!editing && (
                                <button onClick={() => startInlineEdit(shift)} className="text-xs text-cayo-burgundy font-bold px-2 py-1 rounded hover:bg-cayo-burgundy/5">{"\u05e2\u05e8\u05d5\u05da"}</button>
                              )}
                              <button onClick={() => removeShift(shift.id)} className="text-red-400 hover:text-red-600 text-lg leading-none">{"\u00d7"}</button>
                            </div>
                          </div>

                          {/* Inline time editing */}
                          {editing && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 w-12">{"\u05db\u05e0\u05d9\u05e1\u05d4"}</label>
                                <input
                                  type="time"
                                  value={editing.start}
                                  onChange={e => setInlineEdit(prev => ({ ...prev, [shift.id]: { ...prev[shift.id], start: e.target.value } }))}
                                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-cayo-burgundy/30"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 w-12">{"\u05d9\u05e6\u05d9\u05d0\u05d4"}</label>
                                <input
                                  type="time"
                                  value={editing.end}
                                  onChange={e => setInlineEdit(prev => ({ ...prev, [shift.id]: { ...prev[shift.id], end: e.target.value } }))}
                                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-cayo-burgundy/30"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 w-12">{"\u05d4\u05e4\u05e1\u05e7\u05d4"}</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editing.breakMin}
                                  onChange={e => setInlineEdit(prev => ({ ...prev, [shift.id]: { ...prev[shift.id], breakMin: parseInt(e.target.value) || 0 } }))}
                                  className="w-16 px-2 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-cayo-burgundy/30"
                                />
                                <span className="text-xs text-gray-400">{"\u05d3\u05e7'"}</span>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => saveInlineEdit(shift.id)}
                                  disabled={saving}
                                  className="flex-1 py-1.5 bg-cayo-burgundy text-white text-xs font-bold rounded hover:bg-cayo-burgundy/90 disabled:opacity-50"
                                >{saving ? '...' : '\u05e9\u05de\u05d5\u05e8'}</button>
                                <button
                                  onClick={() => cancelInlineEdit(shift.id)}
                                  className="flex-1 py-1.5 bg-gray-200 text-gray-600 text-xs font-bold rounded hover:bg-gray-300"
                                >{"\u05d1\u05d9\u05d8\u05d5\u05dc"}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Empty slots */}
                    {Array.from({ length: emptySlots }, (_, i) => (
                      <div key={`empty_${i}`} className="px-4 py-2.5">
                        <div className="border-2 border-dashed border-gray-200 rounded-lg h-[36px] flex items-center justify-center">
                          <span className="text-gray-300 text-sm">+</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add employee button */}
                  {available.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-gray-100 relative">
                      <button
                        onClick={() => setMobileDrop(mobileDrop === dropKey ? null : dropKey)}
                        className="w-full py-2 text-sm text-cayo-burgundy font-bold bg-cayo-burgundy/5 rounded-lg hover:bg-cayo-burgundy/10 transition-colors"
                      >{"\u05d4\u05d5\u05e1\u05e3 \u05e2\u05d5\u05d1\u05d3"}</button>
                      {mobileDrop === dropKey && (
                        <div className="absolute bottom-full mb-1 right-4 left-4 z-30 bg-white border border-gray-200 rounded-lg shadow-xl max-h-[200px] overflow-y-auto">
                          {available.map(emp => {
                            const isSecondary = emp.role !== role
                            return (
                              <button key={emp.id} onClick={() => addShift(mobileDay, emp.id)} className="w-full text-right px-4 py-3 text-sm font-medium hover:bg-cayo-burgundy/5 transition-colors border-b border-gray-100 last:border-0 flex items-center justify-between">
                                <span>{emp.full_name}</span>
                                {isSecondary && (
                                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                    משני
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ===== DESKTOP: Week Grid ===== */}
        <div className="hidden md:block">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              {/* Day headers */}
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
                    <div className={`px-4 py-1.5 border-b border-t text-sm font-bold ${ROLE_HEADER_COLOR[role]}`}>
                      {ROLE_LABEL[role]}
                    </div>

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
                                    >{"\u00d7"}</button>
                                  </div>
                                  <div className="text-[10px] opacity-60 mt-0.5">
                                    {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                                  </div>
                                </div>
                              ) : slotIdx < ((shiftsByDateRole[`${date}_${role}`] || []).length + (extraSlots[`${date}_${role}`] || 0)) ? (
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
                                        available.map(emp => {
                                          const isSecondary = emp.role !== role
                                          return (
                                            <button key={emp.id} onClick={() => addShift(date, emp.id)} className="w-full text-right px-3 py-2.5 text-xs font-medium hover:bg-cayo-burgundy/5 transition-colors border-b border-gray-100 last:border-0 flex items-center justify-between gap-2">
                                              <span>{emp.full_name}</span>
                                              {isSecondary && (
                                                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
                                                  משני
                                                </span>
                                              )}
                                            </button>
                                          )
                                        })
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

                    <div className="grid grid-cols-7 border-b border-gray-200">
                      {dates.map((date, colIdx) => {
                        const key = `${date}_${role}`
                        const filled = (shiftsByDateRole[key] || []).length
                        const extra = extraSlots[key] || 0
                        const total = filled + extra
                        return (
                          <div key={date} className={`${colIdx > 0 ? 'border-r border-gray-200' : ''} flex items-center justify-center gap-1.5 py-1 bg-gray-50/50`}>
                            <button
                              onClick={() => removeSlotForDay(date, role)}
                              className="w-6 h-6 rounded bg-gray-200 hover:bg-red-100 text-gray-500 hover:text-red-600 text-sm font-bold flex items-center justify-center transition-colors"
                            >-</button>
                            <span className="text-[11px] text-gray-400 font-medium min-w-[16px] text-center">{total}</span>
                            <button
                              onClick={() => addSlotForDay(date, role)}
                              className="w-6 h-6 rounded bg-gray-200 hover:bg-green-100 text-gray-500 hover:text-green-600 text-sm font-bold flex items-center justify-center transition-colors"
                            >+</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Time edit modal (desktop) */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-[340px] p-5" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-cayo-burgundy">{"\u05e2\u05e8\u05d9\u05db\u05ea \u05e9\u05e2\u05d5\u05ea"}</h3>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">{"\u00d7"}</button>
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