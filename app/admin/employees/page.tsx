'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Role = 'bartender' | 'waiter' | 'host' | 'kitchen' | 'dishwasher' | 'manager'
type Gender = 'male' | 'female' | 'other'

interface Employee {
  id: string
  full_name: string
  role: Role
  // Extra roles this employee can be scheduled as (e.g. a bartender who
  // sometimes covers waiter shifts). Display/color is still driven by `role`.
  secondary_roles: Role[]
  phone: string
  email: string
  gender: Gender | null
  active: boolean
  created_at: string
}

const ROLE_LABEL: Record<Role, string> = {
  bartender: 'ברמן',
  waiter: 'מלצר',
  host: 'מארח/ת',
  kitchen: 'מטבח',
  dishwasher: 'שוטף',
  manager: 'אחמ"ש',
}

const GENDER_LABEL: Record<Gender, string> = {
  male: 'זכר',
  female: 'נקבה',
  other: 'אחר',
}

const ROLES: Role[] = ['bartender', 'waiter', 'host', 'kitchen', 'dishwasher', 'manager']
const GENDERS: Gender[] = ['male', 'female', 'other']

const emptyForm = {
  full_name: '',
  role: 'waiter' as Role,
  secondary_roles: [] as Role[],
  phone: '',
  email: '',
  gender: '' as Gender | '',
}

export default function EmployeesPage() {
  const { data: session, status } = useSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') fetchEmployees()
  }, [status])

  async function fetchEmployees() {
    setLoading(true)
    const res = await fetch('/api/employees')
    if (res.ok) setEmployees(await res.json())
    setLoading(false)
  }

  function openCreate() {
    setEditId(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(emp: Employee) {
    setEditId(emp.id)
    setForm({
      full_name: emp.full_name,
      role: emp.role,
      secondary_roles: emp.secondary_roles || [],
      phone: emp.phone || '',
      email: emp.email || '',
      gender: emp.gender || '',
    })
    setError('')
    setShowModal(true)
  }

  function toggleSecondary(role: Role) {
    setForm(f => {
      // Can't pick primary as a secondary.
      if (f.role === role) return f
      return f.secondary_roles.includes(role)
        ? { ...f, secondary_roles: f.secondary_roles.filter(r => r !== role) }
        : { ...f, secondary_roles: [...f.secondary_roles, role] }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      gender: form.gender || undefined,
    }

    const url = editId ? `/api/employees/${editId}` : '/api/employees'
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
    fetchEmployees()
  }

  async function toggleActive(emp: Employee) {
    await fetch(`/api/employees/${emp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !emp.active }),
    })
    fetchEmployees()
  }

  if (status === 'loading' || (status === 'authenticated' && loading)) {
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

  const filtered = employees.filter(e => showInactive || e.active)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-cayo-burgundy">ניהול עובדים</h1>
            <p className="text-sm text-gray-500 mt-0.5">{employees.filter(e => e.active).length} עובדים פעילים</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/hours" className="text-sm text-cayo-burgundy hover:underline">
              שעות עבודה &larr;
            </Link>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-cayo-burgundy text-white text-sm font-bold rounded-lg hover:bg-cayo-burgundy/90 transition-colors"
            >
              + עובד חדש
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Toggle inactive */}
        <label className="flex items-center gap-2 mb-4 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-gray-300"
          />
          הצג עובדים לא פעילים
        </label>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">שם</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">תפקיד</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">טלפון</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">סטטוס</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">
                      אין עובדים {showInactive ? '' : 'פעילים'}
                    </td>
                  </tr>
                )}
                {filtered.map(emp => (
                  <tr key={emp.id} className={`border-b border-gray-100 hover:bg-gray-50 ${!emp.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.full_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cayo-burgundy/10 text-cayo-burgundy">
                          {ROLE_LABEL[emp.role]}
                        </span>
                        {(emp.secondary_roles || []).map(r => (
                          <span
                            key={r}
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500"
                            title="תפקיד משני"
                          >
                            {ROLE_LABEL[r]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 ltr" dir="ltr">{emp.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${emp.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {emp.active ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(emp)}
                          className="text-cayo-burgundy hover:underline text-xs font-bold"
                        >
                          עריכה
                        </button>
                        <button
                          onClick={() => toggleActive(emp)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          {emp.active ? 'השבת' : 'הפעל'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-cayo-burgundy mb-4">
              {editId ? 'עריכת עובד' : 'עובד חדש'}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא *</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד ראשי *</label>
                  <select
                    value={form.role}
                    onChange={e => {
                      const next = e.target.value as Role
                      // If the new primary was in secondary_roles, remove it
                      // so we don't violate the "no duplicate" rule.
                      setForm(f => ({
                        ...f,
                        role: next,
                        secondary_roles: f.secondary_roles.filter(r => r !== next),
                      }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מין</label>
                  <select
                    value={form.gender}
                    onChange={e => setForm(f => ({ ...f, gender: e.target.value as Gender | '' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                  >
                    <option value="">—</option>
                    {GENDERS.map(g => (
                      <option key={g} value={g}>{GENDER_LABEL[g]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תפקידים נוספים
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  תפקידים שהעובד/ת יכול/ה למלא בנוסף. יופיעו גם ברשימה ב&quot;שעות עבודה&quot;.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.filter(r => r !== form.role).map(r => {
                    const selected = form.secondary_roles.includes(r)
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleSecondary(r)}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                          selected
                            ? 'bg-cayo-burgundy/10 border-cayo-burgundy/40 text-cayo-burgundy'
                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                    placeholder="0501234567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cayo-burgundy/30 focus:border-cayo-burgundy outline-none"
                  />
                </div>
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
