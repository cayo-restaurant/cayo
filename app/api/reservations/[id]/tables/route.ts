import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminRequest } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { shiftDayLocal } from '@/lib/shift-day'
import { getReservation } from '@/lib/reservations-store'
import {
  setAssignments,
  clearAssignments,
  getAssignmentsByReservationIds,
  listActiveTables,
} from '@/lib/assignments-store'

// Replace the set of physical tables assigned to a reservation.
//
// Body:
//   {
//     tableIds:       [table uuid, ...]          // may be empty to clear
//     primaryTableId: table uuid | null          // required if tableIds.length > 0,
//                                                // must be one of tableIds
//   }
//
// Response:
//   { success: true, tables: AssignedTable[] }
//
// Auth:
//   - admin (Google OAuth) — full access to any reservation
//   - host (PIN cookie)    — only the current shift day, matching the host
//                            GET scope. Keeps the PIN from being able to
//                            retroactively touch yesterday or pre-stage
//                            tomorrow.
//
// Capacity: Assignment is intentionally decoupled from the availability
// math in lib/capacity.ts — availability is still aggregate-pool based,
// so assigning a party of 6 to a 4-top or double-booking the same table
// is allowed here. Surfacing these as soft warnings in the UI is a Phase
// 3 concern; the endpoint stays permissive by design.
const postSchema = z.object({
  tableIds: z.array(z.string().uuid()).max(10),
  primaryTableId: z.string().uuid().nullable(),
})

// Shared auth + reservation gate. Returns either an error NextResponse to
// short-circuit the handler, or the loaded reservation so downstream code
// doesn't re-fetch it.
async function authorizeReservationMutation(reservationId: string) {
  const admin = await isAdminRequest()
  const host = !admin && isHostRequest()

  if (!admin && !host) {
    return {
      error: NextResponse.json({ error: 'לא מורשה' }, { status: 401 }),
      reservation: null,
    }
  }

  const reservation = await getReservation(reservationId)
  if (!reservation) {
    return {
      error: NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 }),
      reservation: null,
    }
  }

  // Host scope: only today's shift day. The hostess shouldn't be able to
  // reach yesterday's closed service or pre-stage next week from the PIN.
  if (host && reservation.date !== shiftDayLocal()) {
    return {
      error: NextResponse.json(
        { error: 'שיוך שולחן ממצב משמרת זמין רק להזמנות של היום' },
        { status: 403 },
      ),
      reservation: null,
    }
  }

  return { error: null, reservation }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await authorizeReservationMutation(params.id)
  if (gate.error) return gate.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }

  const { tableIds, primaryTableId } = parsed.data
  const uniqueTableIds = Array.from(new Set(tableIds))

  if (uniqueTableIds.length > 0) {
    if (!primaryTableId) {
      return NextResponse.json(
        { error: 'חייב לבחור שולחן ראשי' },
        { status: 400 }
      )
    }
    if (!uniqueTableIds.includes(primaryTableId)) {
      return NextResponse.json(
        { error: 'השולחן הראשי חייב להיות מתוך הרשימה' },
        { status: 400 }
      )
    }
  }

  // Validate every table id exists and is active
  if (uniqueTableIds.length > 0) {
    const allTables = await listActiveTables()
    const activeIds = new Set(allTables.map(t => t.id))
    const missing = uniqueTableIds.find(id => !activeIds.has(id))
    if (missing) {
      return NextResponse.json(
        { error: 'אחד השולחנות לא קיים או לא פעיל' },
        { status: 404 }
      )
    }
  }

  try {
    await setAssignments(params.id, uniqueTableIds, primaryTableId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה בשיוך'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Return the hydrated assignment list so the client can replace its
  // local reservation state without an extra round-trip.
  const assignments = await getAssignmentsByReservationIds([params.id])
  return NextResponse.json({
    success: true,
    tables: assignments.get(params.id) ?? [],
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await authorizeReservationMutation(params.id)
  if (gate.error) return gate.error

  try {
    await clearAssignments(params.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה בהסרה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ success: true, tables: [] })
}
