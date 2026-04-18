import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteReservation, updateReservation, getReservation, listReservations } from '@/lib/reservations-store'
import { isAdminRequest, requireAdmin } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { VALID_TIMES, computeAvailability, checkSlotAvailability } from '@/lib/capacity'
import { shiftDayLocal } from '@/lib/shift-day'

// Status transitions that the on-shift hostess is allowed to make. Anything
// else (editing name/phone/time, approving a pending, cancelling, etc.) stays
// admin-only.
const HOST_ALLOWED_STATUSES = new Set(['arrived', 'no_show', 'confirmed'])

const patchSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'arrived', 'no_show', 'completed']).optional(),
  // Admin edits: contact fields may be blanked out (e.g. anonymous walk-in).
  // Empty string is accepted; non-empty must still match the format.
  name: z.string().max(100).optional(),
  date: z.string().min(1).optional(),
  time: z.string().refine(v => VALID_TIMES.includes(v), { message: 'שעה חייבת להיות בין 19:00 ל-21:30' }).optional(),
  area: z.enum(['bar', 'table']).optional(),
  guests: z.number().min(1).max(10).optional(),
  phone: z.string().refine(v => v === '' || /^05[0-9]{8}$/.test(v), { message: 'מספר טלפון לא תקין' }).optional(),
  email: z.string().refine(v => v === '' || z.string().email().safeParse(v).success, { message: 'אימייל לא תקין' }).optional(),
  notes: z.string().max(500).optional(),
  expectedUpdatedAt: z.string().optional(),
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

    // Extract expectedUpdatedAt for optimistic locking
    const expectedUpdatedAt = parsed.data.expectedUpdatedAt
    // Remove it from the patch data before passing to updateReservation
    const patchData = { ...parsed.data }
    delete patchData.expectedUpdatedAt

    // Narrow what the hostess is allowed to change: status only, and only to
    // one of {arrived, no_show, confirmed} — never pending/cancelled, and
    // never any other field like name/time/phone. Also require the
    // reservation to be on today's date so a hostess device can't be used to
    // mutate a future or past reservation.
    if (host) {
      const keys = Object.keys(patchData)
      if (keys.length !== 1 || keys[0] !== 'status') {
        return NextResponse.json({ error: 'מארחת יכולה לעדכן רק סטטוס הגעה' }, { status: 403 })
      }
      if (!patchData.status || !HOST_ALLOWED_STATUSES.has(patchData.status)) {
        return NextResponse.json({ error: 'סטטוס לא מותר למארחת' }, { status: 403 })
      }
      const existing = await getReservation(params.id)
      if (!existing) {
        return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
      }
      if (existing.date !== shiftDayLocal()) {
        return NextResponse.json({ error: 'ניתן לעדכן רק הזמנות של היום' }, { status: 403 })
      }
    }

    // Admin-only: check capacity if date/time/area/guests/status changes in a way that re-occupies a seat
    if (admin && (patchData.date || patchData.time || patchData.area || patchData.guests || patchData.status)) {
      const existing = await getReservation(params.id)
      if (!existing) {
        return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
      }

      // Determine the effective new values
      const newDate = patchData.date ?? existing.date
      const newTime = patchData.time ?? existing.time
      const newArea = patchData.area ?? existing.area
      const newGuests = patchData.guests ?? existing.guests
      const newStatus = patchData.status ?? existing.status

      // Only re-check if we're changing to an occupying state or moving to a different slot
      const didDateChange = newDate !== existing.date
      const didTimeChange = newTime !== existing.time
      const didAreaChange = newArea !== existing.area
      const didGuestsChange = newGuests !== existing.guests

      if ((didDateChange || didTimeChange || didAreaChange || didGuestsChange) && 
          (newStatus === 'pending' || newStatus === 'confirmed' || newStatus === 'arrived')) {
        const allReservations = await listReservations()
        const capacityError = checkSlotAvailability(allReservations, {
          date: newDate,
          time: newTime,
          area: newArea,
          guests: newGuests,
        }, { excludeReservationId: params.id })
        if (capacityError) {
          return NextResponse.json({ error: capacityError }, { status: 409 })
        }
      }
    }

    const updated = await updateReservation(params.id, patchData, { expectedUpdatedAt })
    if (!updated) {
      // Conflict: either reservation not found or optimistic lock failed
      return NextResponse.json(
        { error: 'ההזמנה שונתה על ידי משתמש אחר. אנא רענן ונסה שוב.' },
        { status: 409 }
      )
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
