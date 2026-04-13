'use client'

import { useState, useEffect, useCallback } from 'react'
import { getServiceClient } from '@/lib/supabase'

interface Reservation {
  id: string
  name: string
  phone: string
  email: string | null
  date: string
  time: string
  guests: number
  notes: string | null
  status: string
  created_at: string
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

const statusLabels: Record<string, string> = {
  pending: 'ממתין',
  confirmed: 'מאושר',
  cancelled: 'בוטל',
}

export default function AdminReservationsPage() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReservations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reservations?date=${date}`)
      const data = await res.json()
      setReservations(data.reservations || [])
    } catch {
      setReservations([])
    }
    setLoading(false)
  }, [date])

  useEffect(() => {
    fetchReservations()
  }, [fetchReservations])

  async function updateStatus(id: string, newStatus: string) {
    await fetch(`/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    fetchReservations()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">הזמנות</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cayo-burgundy/50"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">טוען...</div>
      ) : reservations.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl border">
          אין הזמנות לתאריך זה
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שעה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">שם</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">טלפון</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סועדים</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">הערות</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reservations.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.time}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">
                    <a href={`tel:${r.phone}`} className="text-cayo-burgundy hover:underline">
                      {r.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3">{r.guests}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                    {r.notes || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[r.status]}`}>
                        {statusLabels[r.status]}
                      </span>
                      <select
                        value={r.status}
                        onChange={(e) => updateStatus(r.id, e.target.value)}
                        className="text-xs border rounded px-2 py-1 focus:outline-none"
                      >
                        <option value="pending">ממתין</option>
                        <option value="confirmed">מאושר</option>
                        <option value="cancelled">בוטל</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-500">
        סה&quot;כ {reservations.length} הזמנות | {reservations.reduce((s, r) => s + r.guests, 0)} סועדים
      </div>
    </div>
  )
}
