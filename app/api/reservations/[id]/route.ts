import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteReservation, updateReservation, getReservation } from '@/lib/reservations-store'
import { requireAdmin } from '@/lib/admin-auth'

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
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
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
  const unauthorized = requireAdmin()
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
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
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
  const unauthorized = requireAdmin()
  if (unauthorized) return unauthorized

  const ok = await deleteReservation(params.id)
  if (!ok) {
    return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
