import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteReservation, updateReservation, getReservation } from '@/lib/reservations-store'
import { isAdminRequest, requireAdmin } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'

// Status transitions that the on-shift hostess is allowed to make. Anything
// else (editing name/phone/time, approving a pending, cancelling, etc.) stays
// admin-only.
const HOST_ALLOWED_STATUSES = new Set(['arrived', 'no_show', 'confirmed'])

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

const patchSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'arrived', 'no_show']).optional(),
  name: z.string().min(2).optional(),
  date: z.string().min(1).optional(),
  time: z.string().refine(v => VALID_TIMES.includes(v), { message: 'שעה חייבת להיות בין 19:00 ל-22:30' }).optional(),
  area: z.enum(['bar', 'table']).optional(),
  guests: z.number().min(1).max(10).optional(),
  phone: z.string().regex(/^0[0-9]{9}$/).optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const reservation = await getReservation(params.id)
  if (!reservation) {
    return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
  }
  return NextResponse.json({ reservation })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await isAdminRequest()
  const host = !admin && isHostRequest()
  if (!admin && !host) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
    }

    // Narrow what the hostess is allowed to change: status only, and only to
    // one of {arrived, no_show, confirmed} — never pending/cancelled, and
    // never any other field like name/time/phone. Also require the
    // reservation to be on today's date so a hostess device can't be used to
    // mutate a future or past reservation.
    if (host) {
      const keys = Object.keys(parsed.data)
      if (keys.length !== 1 || keys[0] !== 'status') {
        return NextResponse.json({ error: 'מארחת יכולה לעדכן רק סטטוס הגעה' }, { status: 403 })
      }
      if (!parsed.data.status || !HOST_ALLOWED_STATUSES.has(parsed.data.status)) {
        return NextResponse.json({ error: 'סטטוס לא מותר למארחת' }, { status: 403 })
      }
      const existing = await getReservation(params.id)
      if (!existing) {
        return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
      }
      if (existing.date !== todayLocal()) {
        return NextResponse.json({ error: 'ניתן לעדכן רק הזמנות של היום' }, { status: 403 })
      }
    }

    const updated = await updateReservation(params.id, parsed.data)
    if (!updated) {
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
    }
    return NextResponse.json({ success: true, reservation: updated })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const ok = await deleteReservation(params.id)
  if (!ok) {
    return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
