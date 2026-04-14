import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createReservation, listReservations } from '@/lib/reservations-store'
import { isAdminRequest } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'

// Today's date in Israel local time as YYYY-MM-DD. Used to restrict what the
// hostess can see to the current shift's day only.
function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Reservation hours: 19:00 → 22:30, every 15 min (Israel local time)
const VALID_TIMES = (() => {
  const out: string[] = []
  for (let h = 19; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 30) break
      out.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return out
})()

const reservationSchema = z.object({
  name: z.string().min(2, 'נא להזין שם'),
  date: z.string().min(1, 'נא לבחור יום'),
  time: z.string().refine(v => VALID_TIMES.includes(v), { message: 'שעה חייבת להיות בין 19:00 ל-22:30' }),
  area: z.enum(['bar', 'table']),
  guests: z.number().min(1).max(10),
  phone: z.string().regex(/^0[0-9]{9}$/, 'מספר טלפון לא תקין'),
  email: z.string().email('אימייל לא תקין'),
  terms: z.literal(true),
  notes: z.string().optional(),
})

export async function GET() {
  const admin = await isAdminRequest()
  // Only fall back to a host cookie when the admin cookie isn't present, so
  // admin users don't lose access to the full dataset just because they also
  // happen to have a host cookie on the same device.
  const host = !admin && isHostRequest()

  if (!admin && !host) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const reservations = await listReservations()

  // Hostess-only session: restrict to today's reservations. This also prevents
  // a host-authenticated device from pulling the full customer history.
  if (host) {
    const today = todayLocal()
    return NextResponse.json({ reservations: reservations.filter(r => r.date === today) })
  }

  return NextResponse.json({ reservations })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = reservationSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return NextResponse.json({ error: firstError.message }, { status: 400 })
    }

    const reservation = await createReservation(parsed.data)
    return NextResponse.json({ success: true, id: reservation.id })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}
