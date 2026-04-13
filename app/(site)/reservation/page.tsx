'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import type { Metadata } from 'next'

function generateTimeSlots() {
  const slots: string[] = []
  for (let h = 12; h <= 22; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`)
    if (h < 22 || h === 22) {
      slots.push(`${h.toString().padStart(2, '0')}:30`)
    }
  }
  slots.push('23:00')
  return slots
}

const timeSlots = generateTimeSlots()

function getTomorrowDate() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

interface FormErrors {
  name?: string
  phone?: string
  email?: string
  date?: string
  time?: string
  guests?: string
}

export default function ReservationPage() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    date: '',
    time: '',
    guests: 2,
    notes: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  function validate(): boolean {
    const e: FormErrors = {}
    if (!form.name || form.name.length < 2) e.name = 'נא להזין שם מלא'
    if (!form.phone || !/^0[0-9]{9}$/.test(form.phone)) e.phone = 'מספר טלפון לא תקין (10 ספרות, מתחיל ב-0)'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'כתובת אימייל לא תקינה'
    if (!form.date) e.date = 'נא לבחור תאריך'
    if (!form.time) e.time = 'נא לבחור שעה'
    if (!form.guests || form.guests < 1 || form.guests > 20) e.guests = 'מספר סועדים חייב להיות בין 1 ל-20'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setStatus('loading')
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMessage(data.error || 'שגיאה ביצירת ההזמנה')
        setStatus('error')
      } else {
        setStatus('success')
      }
    } catch {
      setErrorMessage('שגיאה בחיבור לשרת')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center section-padding">
        <div className="max-w-md w-full text-center">
          <div className="bg-cayo-burgundy/40 border border-cayo-teal/30 rounded-2xl p-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cayo-teal/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-cayo-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-cayo-cream mb-2">ההזמנה נקלטה!</h2>
            <p className="text-cayo-cream/60 mb-6">תודה {form.name}, נשמח לראות אותך</p>
            <div className="bg-cayo-dark/50 rounded-xl p-4 text-right space-y-2 text-sm">
              <p className="text-cayo-cream/70"><span className="text-cayo-copper">תאריך:</span> {form.date}</p>
              <p className="text-cayo-cream/70"><span className="text-cayo-copper">שעה:</span> {form.time}</p>
              <p className="text-cayo-cream/70"><span className="text-cayo-copper">סועדים:</span> {form.guests}</p>
            </div>
            {form.email && (
              <p className="mt-4 text-sm text-cayo-cream/50">אישור נשלח ל-{form.email}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-12 section-padding">
      <div className="max-w-lg mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold text-center text-cayo-cream mb-2">
          הזמנת מקום
        </h1>
        <p className="text-cayo-cream/50 text-center mb-10">
          שמרו את המקום שלכם ב-CAYO
        </p>

        <form onSubmit={handleSubmit} className="bg-cayo-burgundy/30 border border-cayo-cream/10 rounded-2xl p-6 sm:p-8 space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm text-cayo-cream/80 mb-1.5">שם מלא *</label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-cayo-dark/50 border border-cayo-cream/20 rounded-lg px-4 py-3 text-cayo-cream placeholder:text-cayo-cream/30 focus:outline-none focus:border-cayo-copper focus:ring-1 focus:ring-cayo-copper/50 transition-colors"
              placeholder="הזינו את שמכם"
            />
            {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm text-cayo-cream/80 mb-1.5">טלפון *</label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-cayo-dark/50 border border-cayo-cream/20 rounded-lg px-4 py-3 text-cayo-cream placeholder:text-cayo-cream/30 focus:outline-none focus:border-cayo-copper focus:ring-1 focus:ring-cayo-copper/50 transition-colors"
              placeholder="0501234567"
              dir="ltr"
            />
            {errors.phone && <p className="mt-1 text-sm text-red-400">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm text-cayo-cream/80 mb-1.5">אימייל</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-cayo-dark/50 border border-cayo-cream/20 rounded-lg px-4 py-3 text-cayo-cream placeholder:text-cayo-cream/30 focus:outline-none focus:border-cayo-copper focus:ring-1 focus:ring-cayo-copper/50 transition-colors"
              placeholder="example@email.com"
              dir="ltr"
            />
            {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="date" className="block text-sm text-cayo-cream/80 mb-1.5">תאריך *</label>
              <input
                id="date"
                type="date"
                value={form.date}
                min={getTomorrowDate()}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full bg-cayo-dark/50 border border-cayo-cream/20 rounded-lg px-4 py-3 text-cayo-cream focus:outline-none focus:border-cayo-copper focus:ring-1 focus:ring-cayo-copper/50 transition-colors"
              />
              {errors.date && <p className="mt-1 text-sm text-red-400">{errors.date}</p>}
            </div>
            <div>
              <label htmlFor="time" className="block text-sm text-cayo-cream/80 mb-1.5">שעה *</label>
              <select
                id="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-full bg-cayo-dark/50 border border-cayo-cream/20 rounded-lg px-4 py-3 text-cayo-cream focus:outline-none focus:border-cayo-copper focus:ring-1 focus:ring-cayo-copper/50 transition-colors"
              >
                <option value="">בחרו שעה</option>
                {timeSlots.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
              {errors.time && <p className="mt-1 text-sm text-red-400">{errors.time}</p>}
            </div>
          </div>

          {/* Guests */}
          <div>
            <label htmlFor="guests" className="block text-sm text-cayo-cream/80 mb-1.5">מספר סועדים *</label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setForm({ ...form, guests: Math.max(1, form.guests - 1) })}
                className="w-10 h-10 rounded-lg bg-cayo-dark/50 border border-cayo-cream/20 text-cayo-cream hover:border-cayo-copper transition-colors flex items-center justify-center text-xl"
              >
                −
              </button>
              <span className="text-2xl font-bold text-cayo-cream min-w-[3rem] text-center">
                {form.guests}
              </span>
              <button
                type="button"
                onClick={() => setForm({ ...form, guests: Math.min(20, form.guests + 1) })}
                className="w-10 h-10 rounded-lg bg-cayo-dark/50 border border-cayo-cream/20 text-cayo-cream hover:border-cayo-copper transition-colors flex items-center justify-center text-xl"
              >
                +
              </button>
            </div>
            {errors.guests && <p className="mt-1 text-sm text-red-400">{errors.guests}</p>}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm text-cayo-cream/80 mb-1.5">הערות</label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full bg-cayo-dark/50 border border-cayo-cream/20 rounded-lg px-4 py-3 text-cayo-cream placeholder:text-cayo-cream/30 focus:outline-none focus:border-cayo-copper focus:ring-1 focus:ring-cayo-copper/50 transition-colors resize-none"
              placeholder="אלרגיות, אירוע מיוחד, העדפת ישיבה..."
            />
          </div>

          {status === 'error' && (
            <div className="bg-red-900/30 border border-red-400/30 rounded-lg p-4 text-red-400 text-sm">
              {errorMessage}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'שולח...' : 'שלחו הזמנה'}
          </Button>
        </form>
      </div>
    </div>
  )
}
