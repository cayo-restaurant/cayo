import { NextResponse } from 'next/server'
import { listReservations } from '@/lib/reservations-store'
import { computeAvailability } from '@/lib/capacity'

// Public endpoint: returns seats-remaining per time slot for a given date.
// Used by the customer booking form to disable full slots and show "תפוס".
// No auth needed — it's intentionally a reveal of availability, not of
// customer identities.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
  }

  try {
    const all = await listReservations()
    const availability = computeAvailability(all, date)
    return NextResponse.json(availability)
  } catch {
    return NextResponse.json(
      { error: 'שגיאה בטעינת זמינות' },
      { status: 500 }
    )
  }
}
