'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import cayoLogo from '../../../cayo_brand_page_005.png'

// ───── Time / date helpers ─────
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

function generateDateOptions() {
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const dayNamesShort = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  const options: {
    value: string
    shortLabel: string     // "היום" / "מחר" / "ה׳ 17.4"
    secondaryLabel: string // "17 אפריל" - under the day
    fullLabel: string      // long label for the summary line
  }[] = []
  const today = new Date()
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const value = d.toISOString().split('T')[0]
    const dayShort = dayNamesShort[d.getDay()]
    const dayLong = dayNames[d.getDay()]
    const dateNum = d.getDate()
    const monthName = months[d.getMonth()]

    const shortLabel =
      i === 0 ? 'היום' :
      i === 1 ? 'מחר'  :
      dayShort
    const secondaryLabel = `${dateNum} ${monthName.slice(0, 3)}`
    const fullLabel = i === 0
      ? `היום · יום ${dayLong}, ${dateNum} ${monthName}`
      : i === 1
      ? `מחר · יום ${dayLong}, ${dateNum} ${monthName}`
      : `יום ${dayLong}, ${dateNum} ${monthName}`

    options.push({ value, shortLabel, secondaryLabel, fullLabel })
  }
  return options
}
const dateOptions = generateDateOptions()

// Split time slots into two friendly groups
const EARLY_SLOTS = timeSlots.filter(t => t < '21:00')
const LATE_SLOTS = timeSlots.filter(t => t >= '21:00')

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

// ───── Tiny reusable UI ─────
function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-black text-cayo-burgundy/70 mb-2">
      {children}
    </label>
  )
}

function Chip({
  active,
  onClick,
  children,
  fullWidth = false,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${fullWidth ? 'w-full' : ''} px-4 py-2.5 rounded-full border-2 font-bold text-sm transition-colors whitespace-nowrap ${
        active
          ? 'bg-cayo-burgundy text-white border-cayo-burgundy'
          : 'bg-white text-cayo-burgundy border-cayo-burgundy/20 hover:border-cayo-burgundy/50'
      }`}
    >
      {children}
    </button>
  )
}

function DayChip({
  active,
  onClick,
  primary,
  secondary,
}: {
  active: boolean
  onClick: () => void
  primary: string
  secondary: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-4 py-2.5 rounded-2xl border-2 font-bold transition-colors text-center min-w-[80px] ${
        active
          ? 'bg-cayo-burgundy text-white border-cayo-burgundy'
          : 'bg-white text-cayo-burgundy border-cayo-burgundy/20 hover:border-cayo-burgundy/50'
      }`}
    >
      <div className="text-sm font-black leading-tight">{primary}</div>
      <div className={`text-[11px] leading-tight ${active ? 'opacity-80' : 'opacity-50'}`}>{secondary}</div>
    </button>
  )
}

// ───── Page ─────
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
    marketing: false,
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const selectedDateOpt = useMemo(
    () => dateOptions.find(d => d.value === form.date),
    [form.date]
  )

  function validate(): boolean {
    const e: FormErrors = {}
    if (!form.name || form.name.trim().length < 2) e.name = 'נא להזין שם'
    if (!form.date) e.date = 'נא לבחור יום'
    if (!form.time) e.time = 'נא לבחור שעה'
    if (!form.area) e.area = 'נא לבחור העדפת ישיבה'
    if (!form.guests || form.guests < 1 || form.guests > 10) e.guests = 'מספר סועדים חייב להיות בין 1 ל-10'
    if (!form.phone || !/^0[0-9]{9}$/.test(form.phone)) e.phone = 'מספר טלפון לא תקין'
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'כתובת אימייל לא תקינה'
    if (!form.terms) e.terms = 'יש לאשר את תנאי השימוש'
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

  const inputClass =
    'w-full bg-white border-2 border-cayo-burgundy/20 rounded-xl px-4 py-3.5 text-cayo-burgundy font-bold text-right placeholder:text-cayo-burgundy/45 placeholder:font-bold focus:outline-none focus:border-cayo-burgundy transition-colors'

  const errorClass = 'mt-1.5 text-sm text-cayo-red text-right font-bold'

  // ───── Success screen ─────
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-cayo-burgundy flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-black text-cayo-burgundy mb-3">הבקשה נקלטה</h2>
          <p className="text-cayo-burgundy/60 mb-2">נחזור אליך עם אישור ההזמנה בהקדם</p>
          <p className="text-cayo-burgundy/40 text-sm mb-8">בינתיים, שמור את הפרטים:</p>
          <div className="border-2 border-cayo-burgundy/15 rounded-2xl p-6 text-right space-y-3 text-sm mb-8">
            <div className="flex justify-between">
              <span className="text-cayo-burgundy font-bold">{selectedDateOpt?.fullLabel}</span>
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

  // ───── Summary line (shown above submit when any field is filled) ─────
  const summaryParts: string[] = []
  if (selectedDateOpt) summaryParts.push(selectedDateOpt.shortLabel === 'היום' || selectedDateOpt.shortLabel === 'מחר' ? selectedDateOpt.shortLabel : `${selectedDateOpt.shortLabel} ${selectedDateOpt.secondaryLabel}`)
  if (form.time) summaryParts.push(form.time)
  if (form.guests) summaryParts.push(`${form.guests} ${form.guests === 1 ? 'סועד' : 'סועדים'}`)
  if (form.area) summaryParts.push(form.area === 'bar' ? 'בר' : 'שולחן')

  return (
    <div className="min-h-screen bg-white py-10 sm:py-14 px-6">
      <div className="max-w-md mx-auto">
        {/* Logo */}
        <Link href="/" className="block mb-10">
          <div className="w-[180px] mx-auto overflow-hidden">
            <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
          </div>
        </Link>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-black text-cayo-burgundy text-center mb-2">הזמנת מקום</h1>
        <p className="text-cayo-burgundy/50 text-center text-sm mb-10">מלאו את הפרטים ונשמור לכם שולחן</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Day */}
          <div>
            <FieldLabel>יום</FieldLabel>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
              {dateOptions.slice(0, 14).map(d => (
                <div key={d.value} className="snap-start">
                  <DayChip
                    active={form.date === d.value}
                    onClick={() => setForm({ ...form, date: d.value })}
                    primary={d.shortLabel}
                    secondary={d.secondaryLabel}
                  />
                </div>
              ))}
            </div>
            {errors.date && <p className={errorClass}>{errors.date}</p>}
          </div>

          {/* Time */}
          <div>
            <FieldLabel>שעה</FieldLabel>
            <div className="space-y-2">
              <div>
                <p className="text-[11px] font-bold text-cayo-burgundy/50 mb-1.5">מוקדם</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {EARLY_SLOTS.map(slot => (
                    <Chip key={slot} active={form.time === slot} onClick={() => setForm({ ...form, time: slot })} fullWidth>
                      <span dir="ltr">{slot}</span>
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-cayo-burgundy/50 mb-1.5 mt-2">מאוחר</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {LATE_SLOTS.map(slot => (
                    <Chip key={slot} active={form.time === slot} onClick={() => setForm({ ...form, time: slot })} fullWidth>
                      <span dir="ltr">{slot}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
            {errors.time && <p className={errorClass}>{errors.time}</p>}
          </div>

          {/* Guests */}
          <div>
            <FieldLabel>מספר אנשים</FieldLabel>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <Chip key={n} active={form.guests === n} onClick={() => setForm({ ...form, guests: n })} fullWidth>
                  {n}
                </Chip>
              ))}
            </div>
            {errors.guests && <p className={errorClass}>{errors.guests}</p>}
          </div>

          {/* Area (seating preference) */}
          <div>
            <FieldLabel>העדפת ישיבה</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <Chip active={form.area === 'bar'} onClick={() => setForm({ ...form, area: 'bar' })} fullWidth>בר</Chip>
              <Chip active={form.area === 'table'} onClick={() => setForm({ ...form, area: 'table' })} fullWidth>שולחן</Chip>
            </div>
            {errors.area && <p className={errorClass}>{errors.area}</p>}
          </div>

          {/* Name */}
          <div>
            <FieldLabel htmlFor="name">שם מלא</FieldLabel>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              placeholder="למשל: יעל כהן"
              autoComplete="name"
            />
            {errors.name && <p className={errorClass}>{errors.name}</p>}
          </div>

          {/* Phone */}
          <div>
            <FieldLabel htmlFor="phone">טלפון</FieldLabel>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
              placeholder="050-1234567"
              dir="ltr"
              autoComplete="tel"
            />
            {errors.phone && <p className={errorClass}>{errors.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <FieldLabel htmlFor="email">אימייל</FieldLabel>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className={inputClass}
              placeholder="name@example.com"
              dir="ltr"
              autoComplete="email"
            />
            {errors.email && <p className={errorClass}>{errors.email}</p>}
          </div>

          {/* Terms + marketing checkboxes (split for compliance) */}
          <div className="pt-2 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.terms}
                onChange={e => setForm({ ...form, terms: e.target.checked })}
                className="mt-1 w-5 h-5 rounded border-2 border-cayo-burgundy/30 text-cayo-burgundy focus:ring-cayo-burgundy focus:ring-offset-0 cursor-pointer accent-cayo-burgundy shrink-0"
              />
              <span className="text-sm text-cayo-burgundy/70 leading-relaxed">
                קראתי ואני מסכים/ה ל<a href="#" className="underline font-bold hover:text-cayo-burgundy">תנאי השימוש</a>
              </span>
            </label>
            {errors.terms && <p className="mt-1.5 text-sm text-cayo-red font-bold">{errors.terms}</p>}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.marketing}
                onChange={e => setForm({ ...form, marketing: e.target.checked })}
                className="mt-1 w-5 h-5 rounded border-2 border-cayo-burgundy/30 text-cayo-burgundy focus:ring-cayo-burgundy focus:ring-offset-0 cursor-pointer accent-cayo-burgundy shrink-0"
              />
              <span className="text-sm text-cayo-burgundy/70 leading-relaxed">
                אני מעוניין/ת לקבל עדכונים ודיוור מ-CAYO <span className="text-cayo-burgundy/40">(רשות)</span>
              </span>
            </label>
          </div>

          {/* Error message */}
          {status === 'error' && (
            <div className="bg-cayo-red/10 border-2 border-cayo-red/20 rounded-xl p-4 text-cayo-red text-sm">
              {errorMessage}
            </div>
          )}

          {/* Pre-submit summary */}
          {summaryParts.length > 0 && (
            <div className="bg-cayo-burgundy/5 border-2 border-cayo-burgundy/15 rounded-xl px-4 py-3 text-center text-sm font-bold text-cayo-burgundy/80">
              {summaryParts.join(' · ')}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full py-4 bg-cayo-burgundy text-white font-black text-lg rounded-full hover:bg-cayo-burgundy/90 transition-all hover:shadow-lg hover:shadow-cayo-burgundy/30 disabled:opacity-50"
          >
            {status === 'loading' ? 'שולח...' : 'שלחו הזמנה'}
          </button>
        </form>
      </div>
    </div>
  )
}
