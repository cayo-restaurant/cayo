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
  bartender: 'ברמן',
  waiter: 'מלצר',
  host: 'מארח/ת',
  kitchen: 'מטבח',
  dishwasher: 'שוטף',
  manager: 'אחמ"ש',
}

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function calcHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let totalMin = (eh * 60 + em) - (sh * 60 + sm)
  if (totalMin < 0) totalMin += 24 * 60
  totalMin -= breakMin
  return Math.max(0, totalMin / 60)
}

function formatDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return `${d}/${m}/${y}`
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function HoursPage() {
  const { data: session, status } = useSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [month, setMonth] = useState(currentMonth())
  const [filterEmployee, setFilterEmployee] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    employee_id: '',
    date: todayStr(),
    start_time: '18:00',
    end_time: '02:00',
    break_minutes: 0,
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'shifts' | 'summary'>('shifts')

  useEffect(() => {
    if (status === 'authenticated') {
      fetchEmployees()
    }
  }, [status])

  useEffect(() => {
    if (status === 'authenticated') fetchShifts()
  }, [status, month, filterEmployee])

  async function fetchEmployees() {
    const res = await fetch('/api/employees')
    if (res.ok) {
      const data = await res.json()
      setEmployees(data.filter((e: Employee) => e.active))
    }
  }

  async function fetchShifts() {
    setLoading(true)
    let url = `/api/shifts?month=${month}`
    if (filterEmployee) url += `&employee_id=${filterEmployee}`
    const res = await fetch(url)
    if (res.ok) setShifts(await res.json())
    setLoading(false)
  }

  function openCreate() {
    setEditId(null)
    setForm({
      employee_id: employees[0]?.id || '',
      date: todayStr(),
      start_time: '18:00',
      end_time: '02:00',
      break_minutes: 0,
      notes: '',
    })
    setError('')
    setShowModal(true)
  }

  function openEdit(shift: Shift) {
    setEditId(shift.id)
    setForm({
      employee_id: shift.employee_id,
      date: shift.date,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      break_minutes: shift.break_minutes,
      notes: shift.notes || '',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      break_minutes: Number(form.break_minutes),
    }

    const url = editId ? `/api/shifts/${editId}` : '/api/shifts'
    const method = editId ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(typeof data.error === 'string' ? data.error : 'שגיאה בשמירה')
      setSaving(false)
      return
    }

    setSaving(false)
    setShowModal(false)
    fetchShifts()
  }

  async function deleteShift(id: string) {
    if (!confirm('למחוק משמרת זו?')) return
    await fetch(`/api/shifts/${id}`, { method: 'DELETE' })
    fetchShifts()
  }

  // Monthly summary
  const summary = useMemo(() => {
    const map = new Map<string, { name: string; role: Role; rate: number; totalHours: number; totalPay: number; shiftCount: number }>()
    for (const s of shifts) {
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
  }, [shifts])

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
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-cayo-burgundy">שעות עבודה</h1>
            <p className="text-sm text-gray-500 mt-0.5">{monthLabel(month)}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/employees" className="text-sm text-cayo-burgundy hover:underline">
              ניהול עובדים
            </Link>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-cayo-burgundy text-white text-sm font-bold rounded-lg hover:bg-cayo-burgundy/90 transition-colors"
            >
              + משמרת חדשה
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Month navigation */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg">
            <button onClick={() => shiftMonth(-1)} className="px-3 py-2 hover:bg-gray-50 rounded-r-lg text-gray-600">&rarr;</button>
            <span className="px-3 py-2 text-sm font-medium text-gray-700">{monthLabel(month)}</span>
            <button onClick={() => shiftMonth(1)} className="px-3 py-2 hover:bg-gray-50 rounded-l-lg text-gray-600">&larr;</button>
          </div>

          {/* Employee filter */}
          <select
            value={filterEmployee}
            onChange={e => setFilterEmployee(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">כל העובדים</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.full_name}</option>
            ))}
          </select>

          {/* Tabs */}
          <div className="flex bg-white border border-gray-200 rounded-lg mr-auto">
            <button
              onClick={() => setTab('shifts')}
              className={`px-4 py-2 text-sm font-medium rounded-r-lg transition-colors ${tab === 'shifts' ? 'bg-cayo-burgundy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              משמרות
            </button>
            <button
              onClick={() => setTab('summary')}
              className={`px-4 py-2 text-sm font-medium rounded-l-lg transition-colors ${tab === 'summary' ? 'bg-cayo-burgundy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              סיכום חודשי
            </button>
          </div>

          {/* Export */}
          <a
            href={`/api/shifts/export?month=${month}`}
            className="px-4 py-2 border border-cayo-burgundy text-cayo-burgundy text-sm font-bold rounded-lg hover:bg-cayo-burgundy/5 transition-colors"
          >
            ייצוא CSV
          </a>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-cayo-burgundy border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'shifts' ? (
          /* Shifts table */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">עובד</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">תפקיד</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">תאריך</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">התחלה</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">סיום</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">הפסקה</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">שעות</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">שכר</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">
                        אין משמרות בחודש זה
                      </td>
                    </tr>
                  )}
                  {shifts.map(s => {
                    const hours = calcHours(s.start_time, s.end_time, s.break_minutes)
                    const rate = s.employees?.hourly_rate || 0
                    const pay = hours * rate
                    return (
                      <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{s.employees?.full_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cayo-burgundy/10 text-cayo-burgundy">
                            {ROLE_LABEL[s.employees?.role as Role] || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(s.date)}</td>
                        <td className="px-4 py-3 text-gray-600">{s.start_time.slice(0, 5)}</td>
                        <td className="px-4 py-3 text-gray-600">{s.end_time.slice(0, 5)}</td>
                        <td className="px-4 py-3 text-gray-600">{s.break_minutes ? `${s.break_minutes} ד׳` : '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{hours.toFixed(1)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{rate > 0 ? `₪${pay.toFixed(0)}` : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEdit(s)} className="text-cayo-burgundy hover:underline text-xs font-bold">
                              עריכה
                            </button>
                            <button onClick={() => deleteShift(s.id)} className="text-red-400 hover:text-red-600 text-xs">
                              מחיקה
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Monthly summary */
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">סה&quot;כ משמרות</p>
                <p className="text-2xl font-bold text-cayo-burgundy">{shifts.length}</p>
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
                        <td colSpan={6} className="text-center py-12 text-gray-400">אין נתונים לחודש זה</td>
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
                        <td className="px-4 py-3 text-gray-600">₪{e.rate}</td>
                        <td className="px-4 py-3 font-bold text-cayo-burgundy">₪{e.totalPay.toFixed(0)}</td>
                      </tr>
                    ))}
                    {summary.length > 0 && (
                      <tr className="bg-gray-50 font-bold">
                        <td className="px-4 py-3 text-gray-900" colSpan={3}>סה&quot;כ</td>
                        <td className="px-4 py-3 text-gray-900">{grandTotalHours.toFixed(1)}</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-cayo-burgundy">₪{grandTotalPay.toFixed(0)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-cayo-burgundy mb-4">
              {editId ? 'עריכת משמרת' : 'משמרת חדשה'}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">עובד *</label>
                <select
                  required
                  value={form.employee_id}
                  onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                >
                  <option value="">בחר עובד</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name} — {ROLE_LABEL[emp.role]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך *</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שעת התחלה *</label>
                  <input
                    type="time"
                    required
                    value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שעת סיום *</label>
                  <input
                    type="time"
                    required
                    value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הפסקה (דקות)</label>
                <input
                  type="number"
                  min="0"
                  value={form.break_minutes}
                  onChange={e => setForm(f => ({ ...f, break_minutes: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                  placeholder="אירוע מיוחד, החלפה..."
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-cayo-burgundy text-white font-bold rounded-lg hover:bg-cayo-burgundy/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'שומר...' : editId ? 'עדכון' : 'הוספה'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
