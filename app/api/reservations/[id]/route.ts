import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteReservation, updateReservation, getReservation, listReservations, createReservation, logReservationEvent } from '@/lib/reservations-store'
import { isAdminRequest, requireAdmin } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { VALID_TIMES, computeAvailability, checkSlotAvailability } from '@/lib/capacity'
import { shiftDayLocal } from '@/lib/shift-day'
import { autoPickTables } from '@/lib/auto-assign'
import { setAssignments, clearAssignments } from '@/lib/assignments-store'
import { findNextWaiting, markAssigned } from '@/lib/waiting-list-store'

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
  internalNotes: z.string().max(1000).optional(),
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

    // Host permissions: can edit all fields on today's reservations.
    // Status changes are restricted to the allowed set (arrived/no_show/confirmed).
    if (host) {
      if (patchData.status && !HOST_ALLOWED_STATUSES.has(patchData.status)) {
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

    // Snapshot the pre-update state so we can log diffs below.
    const pre = await getReservation(params.id)

    const updated = await updateReservation(params.id, patchData, { expectedUpdatedAt })
    if (!updated) {
      // Conflict: either reservation not found or optimistic lock failed
      return NextResponse.json(
        { error: 'ההזמנה שונתה על ידי משתמש אחר. אנא רענן ונסה שוב.' },
        { status: 409 }
      )
    }

    // ── Audit events ─────────────────────────────────────────────────────────
    // Record any field-level changes that matter for the analytics dashboard.
    // Failures here are swallowed inside logReservationEvent so they never
    // break the PATCH response.
    if (pre) {
      const actor = admin ? 'admin' : host ? 'host' : 'unknown'
      if (patchData.status && patchData.status !== pre.status) {
        void logReservationEvent({
          reservationId: params.id,
          eventType: 'status_change',
          actor,
          oldValue: pre.status,
          newValue: updated.status,
        })
      }
      if (patchData.guests !== undefined && patchData.guests !== pre.guests) {
        void logReservationEvent({
          reservationId: params.id,
          eventType: 'guests_change',
          actor,
          oldValue: pre.guests,
          newValue: updated.guests,
        })
      }
      if (patchData.time !== undefined && patchData.time !== pre.time) {
        void logReservationEvent({
          reservationId: params.id,
          eventType: 'time_change',
          actor,
          oldValue: pre.time,
          newValue: updated.time,
        })
      }
      if (patchData.date !== undefined && patchData.date !== pre.date) {
        void logReservationEvent({
          reservationId: params.id,
          eventType: 'date_change',
          actor,
          oldValue: pre.date,
          newValue: updated.date,
        })
      }
    }

    // ── Waiting list promotion ────────────────────────────────────────────────
    // When a reservation transitions to a "releasing" status (cancelled,
    // no_show, completed), its table(s) free up. Check if someone on the
    // waiting list for the same date can now be served.
    const RELEASING = new Set(['cancelled', 'no_show', 'completed'])
    if (patchData.status && RELEASING.has(patchData.status) && updated.tables.length > 0) {
      try {
        // Clear the assignments so the table is really free
        await clearAssignments(params.id)

        // For each freed table, try to promote the oldest waiting entry that fits
        for (const freedTable of updated.tables) {
          const candidate = await findNextWaiting(updated.date, freedTable.capacityMax)
          if (!candidate) continue

          // Auto-assign: try to find the best table(s) for this candidate
          const bestTables = await autoPickTables(
            candidate.requestedDate,
            candidate.requestedTime,
            candidate.guests,
            'table',
          )
          if (bestTables.length === 0) continue

          // Create a new reservation from the waiting list entry. Source
          // stays 'customer' — this guest originally booked via the public form
          // and just got promoted off the waiting list.
          const newReservation = await createReservation({
            name: candidate.name,
            phone: candidate.phone,
            email: '',
            date: candidate.requestedDate,
            time: candidate.requestedTime,
            area: 'table',
            guests: candidate.guests,
            terms: true,
            source: 'customer',
          }, { actor: 'system' })
          await setAssignments(
            newReservation.id,
            bestTables.map(t => t.id),
            bestTables[0].id,
          )
          await markAssigned(candidate.id, newReservation.id)
          break
        }
      } catch (promoteErr) {
        console.error('[reservations PATCH] waiting-list promotion error:', promoteErr)
      }
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
