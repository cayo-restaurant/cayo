import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createReservation,
  listReservations,
  markStaleConfirmedAsNoShow,
} from '@/lib/reservations-store'
import { isAdminRequest } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { checkSlotAvailability } from '@/lib/capacity'

// The hostess's "today" isn't the calendar day — it's the shift day. A shift
// that opens at, say, Monday 19:00 keeps its Monday identity until 04:00
// Tuesday morning, at which point the dashboard rolls forward to Tuesday.
// This matches how the restaurant actually thinks about a service night.
//
// We compute this in Asia/Jerusalem regardless of where the server runs:
// subtract 4 hours from "now", then format the resulting instant as a
// YYYY-MM-DD in Israel local time. That single transformation expresses
// "the 4am cutoff lives at Israel local midnight + 4h".
const SHIFT_CUTOFF_HOURS = 4

function shiftDayLocal(): string {
  const shifted = new Date(Date.now() - SHIFT_CUTOFF_HOURS * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

// Reservation hours: 19:00 → 21:30, every 15 min (Israel local time)
const VALID_TIMES = (() => {
  const out: string[] = []
  for (let h = 19; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 21 && m > 30) break
      out.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return out
})()

const reservationSchema = z.object({
  name: z.string().min(2, 'נא להזין שם'),
  date: z.string().min(1, 'נא לבחור יום'),
  time: z.string().refine(v => VALID_TIMES.includes(v), { message: 'שעה חייבת להיות בין 19:00 ל-21:30' }),
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

  // Close the books on any previous shift day before we list. Any reservation
  // still `confirmed` on a past date never got marked arrived/no-show, so we
  // record it as `no_show` — both to free the active list for today's shift
  // and to keep stats honest. The sweep runs for admin GETs too so the
  // attendance numbers stay accurate for both surfaces.
  const today = shiftDayLocal()
  try {
    await markStaleConfirmedAsNoShow(today)
  } catch {
    // Non-fatal: if the sweep fails we still want to serve the list.
  }

  const reservations = await listReservations()

  // Hostess-only session: restrict to today's shift only. This also prevents
  // a host-authenticated device from pulling the full customer history.
  if (host) {
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

    // Capacity gate: reject if this reservation would overfill the chosen
    // area at the chosen time. Computed against the current DB state; there's
    // a small race window between check and insert, but for restaurant-scale
    // volumes that's acceptable (and admin can always cancel an overbooking).
    const existing = await listReservations()
    const capacityError = checkSlotAvailability(existing, {
      date: parsed.data.date,
      time: parsed.data.time,
      area: parsed.data.area,
      guests: parsed.data.guests,
    })
    if (capacityError) {
      return NextResponse.json({ error: capacityError }, { status: 409 })
    }

    const reservation = await createReservation(parsed.data)
    return NextResponse.json({ success: true, id: reservation.id })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}
