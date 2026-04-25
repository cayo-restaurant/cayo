import { NextResponse } from 'next/server'
import { listReservations } from '@/lib/reservations-store'
import { computeAvailability } from '@/lib/capacity'
import { getZoneConfig } from '@/lib/zones'

// Public endpoint: returns seats-remaining per time slot for a given date.
// Used by the customer booking form to disable full slots and show "תפוס".
// No auth needed — it's intentionally a reveal of availability, not of
// customer identities.
//
// The response also carries the current zone config (bar/table capacity +
// max bar party size) so the client form doesn't have to hardcode those
// numbers — when the owner edits them in the zones table they flow through
// to the UI on the next poll.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
  }

  try {
    const [all, zones] = await Promise.all([
      listReservations(),
      getZoneConfig(),
    ])
    const availability = computeAvailability(all, date, zones)
    return NextResponse.json(availability)
  } catch {
    return NextResponse.json(
      { error: 'שגיאה בטעינת זמינות' },
      { status: 500 }
    )
  }
}
