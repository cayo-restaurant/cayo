'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import cayoLogo from '../../../cayo_brand_page_005.png'

// Time slots: 19:00 to 22:30, every 15 min
function generateTimeSlots() {
  const slots: string[] = []
  for (let h = 19; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 30) break
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return slots
}

const timeSlots = generateTimeSlots()

// Generate next 60 days as options with Hebrew day names
function generateDateOptions() {
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  const options: { value: string; label: string }[] = []
  const today = new Date()
  for (let i = 0; i < 60; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const value = d.toISOString().split('T')[0]
    const dayName = dayNames[d.getDay()]
    const label = i === 0
      ? `היום, ${dayName} ${d.getDate()} ${months[d.getMonth()]}`
      : i === 1
      ? `מחר, ${dayName} ${d.getDate()} ${months[d.getMonth()]}`
      : `יום ${dayName}, ${d.getDate()} ${months[d.getMonth()]}`
    options.push({ value, label })
  }
  return options
}

const dateOptions = generateDateOptions()

interface FormErrors {
  name?: string
  date?: string
  time?: string
  area?: string
  guests?: string
  phone?: string
  email?: string
  terms?: string
}

export default function ReservationPage() {
  const [form, setForm] = useState({
    name: '',
    date: '',
    time: '',
    area: '',
    guests: 0,
    phone: '',
    email: '',
    terms: false,
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  function validate(): boolean {
    const e: FormErrors = {}
    if (!form.name || form.name.trim().length < 2) e.name = 'נא להזין שם'
    if (!form.date) e.date = 'נא לבחור יום'
    if (!form.time) e.time = 'נא לבחור שעה'
    if (!form.area) e.area = 'נא לבחור אזור'
    if (!form.guests || form.guests < 1 || form.guests > 10) e.guests = 'מספר סועדים חייב להיות בין 1 ל-10'
    if (!form.phone || !/^0[0-9]{9}$/.test(form.phone)) e.phone = 'מספר טלפון לא תקין'
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'כתובת אימייל לא תקינה'
    if (!form.terms) e.terms = 'יש לאשר את תנאי השימוש והדיוור'
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

  const fieldClass = 'w-full bg-white border-2 border-cayo-burgundy/20 rounded-xl px-4 py-3.5 text-cayo-burgundy font-bold text-center placeholder:text-cayo-burgundy/30 placeholder:font-bold focus:outline-none focus:border-cayo-burgundy transition-colors'

  if (status === 'success') {
    const selectedDate = dateOptions.find(d => d.value === form.date)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-cayo-burgundy flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-black text-cayo-burgundy mb-3">ההזמנה נקלטה</h2>
          <p className="text-cayo-burgundy/60 mb-8">נשמח לראות אותך ב-CAYO</p>
          <div className="border-2 border-cayo-burgundy/15 rounded-2xl p-6 text-right space-y-3 text-sm mb-8">
            <div className="flex justify-between">
              <span className="text-cayo-burgundy font-bold">{selectedDate?.label}</span>
              <span className="text-cayo-burgundy/50">יום</span>
            </div>
            <div className="h-px bg-cayo-burgundy/10" />
            <div className="flex justify-between">
              <span className="text-cayo-burgundy font-bold">{form.time}</span>
              <span className="text-cayo-burgundy/50">שעה</span>
            </div>
            <div className="h-px bg-cayo-burgundy/10" />
            <div className="flex justify-between">
              <span className="text-cayo-burgundy font-bold">{form.guests}</span>
              <span className="text-cayo-burgundy/50">סועדים</span>
            </div>
          </div>
          <Link
            href="/"
            className="inline-block px-10 py-3.5 bg-cayo-burgundy text-white font-bold rounded-full hover:bg-cayo-burgundy/90 transition-colors"
          >
            חזרה לעמוד הראשי
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white py-10 sm:py-14 px-6">
      <div className="max-w-md mx-auto">
        {/* Logo */}
        <Link href="/" className="block mb-10">
          <div className="w-[180px] mx-auto overflow-hidden">
            <Image
              src={cayoLogo}
              alt="CAYO"
              className="w-full h-auto scale-[1.35]"
              priority
            />
          </div>
        </Link>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-black text-cayo-burgundy text-center mb-2">
          הזמנת מקום
        </h1>
        <p className="text-cayo-burgundy/50 text-center text-sm mb-10">
          מלאו את הפרטים ונשמור לכם שולחן
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={fieldClass}
              placeholder="שם מלא"
            />
            {errors.name && <p className="mt-1.5 text-sm text-cayo-red text-center">{errors.name}</p>}
          </div>

          {/* Day */}
          <div>
            <select
              id="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={fieldClass}
            >
              <option value="">בחרו יום</option>
              {dateOptions.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            {errors.date && <p className="mt-1.5 text-sm text-cayo-red text-center">{errors.date}</p>}
          </div>

          {/* Time */}
          <div>
            <select
              id="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className={fieldClass}
            >
              <option value="">בחרו שעה</option>
              {timeSlots.map((slot) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
            {errors.time && <p className="mt-1.5 text-sm text-cayo-red text-center">{errors.time}</p>}
          </div>

          {/* Guests */}
          <div>
            <select
              id="guests"
              value={form.guests || ''}
              onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })}
              className={fieldClass}
            >
              <option value="">מספר אנשים</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'סועד' : 'סועדים'}
                </option>
              ))}
            </select>
            {errors.guests && <p className="mt-1.5 text-sm text-cayo-red text-center">{errors.guests}</p>}
          </div>

          {/* Area */}
          <div>
            <select
              id="area"
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              className={fieldClass}
            >
              <option value="">אזור</option>
              <option value="bar">בר</option>
              <option value="table">שולחן</option>
            </select>
            {errors.area && <p className="mt-1.5 text-sm text-cayo-red text-center">{errors.area}</p>}
          </div>

          {/* Phone */}
          <div>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={fieldClass}
              placeholder="מספר טלפון"
            />
            {errors.phone && <p className="mt-1.5 text-sm text-cayo-red text-center">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={fieldClass}
              placeholder="אימייל"
            />
            {errors.email && <p className="mt-1.5 text-sm text-cayo-red text-center">{errors.email}</p>}
          </div>

          {/* Terms checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.checked })}
                className="mt-1 w-5 h-5 rounded border-2 border-cayo-burgundy/30 text-cayo-burgundy focus:ring-cayo-burgundy focus:ring-offset-0 cursor-pointer accent-cayo-burgundy shrink-0"
              />
              <span className="text-sm text-cayo-burgundy/70 leading-relaxed">
                קראתי ואני מסכים/ה ל<a href="#" className="underline font-bold hover:text-cayo-burgundy">תנאי השימוש</a> ולקבלת עדכונים ודיוור מ-CAYO
              </span>
            </label>
            {errors.terms && <p className="mt-1.5 text-sm text-cayo-red">{errors.terms}</p>}
          </div>

          {/* Error message */}
          {status === 'error' && (
            <div className="bg-cayo-red/10 border-2 border-cayo-red/20 rounded-xl p-4 text-cayo-red text-sm">
              {errorMessage}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full py-4 bg-cayo-burgundy text-white font-black text-lg rounded-full hover:bg-cayo-burgundy/90 transition-all hover:shadow-lg hover:shadow-cayo-burgundy/30 disabled:opacity-50 mt-4"
          >
            {status === 'loading' ? 'שולח...' : 'שלחו הזמנה'}
          </button>
        </form>
      </div>
    </div>
  )
}
