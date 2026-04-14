// ─── Venue capacity + availability math ──────────────────────────────────────
//
// Capacity numbers live in env vars so they're easy to update without a code
// change. Until the real seat counts are known, the defaults below are set to
// a huge number that effectively disables the capacity gate — i.e. the system
// behaves exactly as it did before this file existed. To turn the gate on,
// set BAR_CAPACITY and TABLE_CAPACITY in .env.local (and on Vercel).
//
// .env.local example:
//   BAR_CAPACITY=20
//   TABLE_CAPACITY=40
//   RESERVATION_DURATION_MINUTES=120
//
// Reservation duration decides how long a booking occupies its seats. A
// reservation at 19:00 with duration=120 blocks 19:00, 19:15, …, 20:45.
// 21:00 onward is free again (for those seats).

export const BAR_CAPACITY = Number(process.env.BAR_CAPACITY ?? 999)
export const TABLE_CAPACITY = Number(process.env.TABLE_CAPACITY ?? 999)
export const RESERVATION_DURATION_MINUTES = Number(
  process.env.RESERVATION_DURATION_MINUTES ?? 120
)

// Keep in sync with the booking form + reservations route.
// Reservation hours: 19:00 → 21:30, every 15 min (Israel local time).
export const VALID_TIMES: string[] = (() => {
  const out: string[] = []
  for (let h = 19; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 21 && m > 30) break
      out.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return out
})()

// Reservation statuses that actually occupy a seat. cancelled and no_show
// free the seat up again.
const OCCUPYING_STATUSES = new Set(['pending', 'confirmed', 'arrived'])

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export type Area = 'bar' | 'table'

export interface ReservationLike {
  date: string
  time: string
  area: Area
  guests: number
  status: string
  // Ignored by the math, but the caller can pass extra fields through.
  [key: string]: unknown
}

export interface AvailabilityMap {
  // For each valid time slot, how many seats are still free.
  bar: Record<string, number>
  table: Record<string, number>
  capacity: { bar: number; table: number }
  durationMinutes: number
}

export function computeAvailability(
  reservations: ReservationLike[],
  date: string,
  opts: { excludeReservationId?: string } = {}
): AvailabilityMap {
  const duration = RESERVATION_DURATION_MINUTES
  const bar: Record<string, number> = {}
  const table: Record<string, number> = {}

  const active = reservations.filter(
    r =>
      r.date === date &&
      OCCUPYING_STATUSES.has(r.status) &&
      (!opts.excludeReservationId || r.id !== opts.excludeReservationId)
  )

  for (const slot of VALID_TIMES) {
    const slotMin = timeToMinutes(slot)
    let barUsed = 0
    let tableUsed = 0
    for (const r of active) {
      const start = timeToMinutes(r.time)
      const end = start + duration
      if (slotMin >= start && slotMin < end) {
        if (r.area === 'bar') barUsed += r.guests
        else tableUsed += r.guests
      }
    }
    bar[slot] = Math.max(0, BAR_CAPACITY - barUsed)
    table[slot] = Math.max(0, TABLE_CAPACITY - tableUsed)
  }

  return {
    bar,
    table,
    capacity: { bar: BAR_CAPACITY, table: TABLE_CAPACITY },
    durationMinutes: duration,
  }
}

// Single-slot variant used by the POST handler before creating a reservation.
// Returns `null` if there's room, or a human-readable Hebrew reason if not.
export function checkSlotAvailability(
  reservations: ReservationLike[],
  candidate: { date: string; time: string; area: Area; guests: number }
): string | null {
  const map = computeAvailability(reservations, candidate.date)
  const remaining =
    candidate.area === 'bar' ? map.bar[candidate.time] : map.table[candidate.time]
  if (remaining === undefined) {
    return 'שעה לא תקינה'
  }
  if (remaining < candidate.guests) {
    if (remaining === 0) {
      return 'אין מקום פנוי בשעה זו. נא לבחור שעה אחרת.'
    }
    return `נותרו ${remaining} מקומות בלבד בשעה זו. נא לבחור מספר סועדים קטן יותר או שעה אחרת.`
  }
  return null
}
