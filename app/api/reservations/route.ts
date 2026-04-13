import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createReservation, listReservations } from '@/lib/reservations-store'
import { isAdminRequest } from '@/lib/admin-auth'

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
  area: z.enum(['bar', 'table'], { errorMap: () => ({ message: 'נא לבחור אזור' }) }),
  guests: z.number().min(1).max(10),
  phone: z.string().regex(/^0[0-9]{9}$/, 'מספר טלפון לא תקין'),
  email: z.string().email('אימייל לא תקין'),
  terms: z.literal(true, { errorMap: () => ({ message: 'יש לאשר את תנאי השימוש והדיוור' }) }),
  notes: z.string().optional(),
})

export async function GET() {
  // Only admins can list all reservations
  if (!isAdminRequest()) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }
  const reservations = await listReservations()
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
