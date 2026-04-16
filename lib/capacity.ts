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
// Per-reservation cap at the bar: bar bookings are walk-up-style, no party
// larger than this can be booked together on bar stools. Tables are not
// constrained per-reservation (only by TABLE_CAPACITY).
export const MAX_BAR_PARTY = Number(process.env.MAX_BAR_PARTY ?? 3)
export const RESERVATION_DURATION_MINUTES = Number(
  process.env.RESERVATION_DURATION_MINUTES ?? 120
)

// Keep in sync with the booking form + reservations route.
// Reservation hours: 19:00 → 22:00, every 15 min (Israel local time).
export const VALID_TIMES: string[] = (() => {
  const out: string[] = []
  for (let h = 19; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 0) break
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
  // `id` is optional because not every caller has it (e.g. a candidate
  // that hasn't been inserted yet). When present it's used to exclude a
  // specific reservation from the availability calculation.
  id?: string
  date: string
  time: string
  area: Area
  guests: number
  status: string
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

// Single-slot variant used by the POST handler before creating a reservation,
// and by PATCH to check if an update would violate capacity.
// Returns `null` if there's room, or a human-readable Hebrew reason if not.
export function checkSlotAvailability(
  reservations: ReservationLike[],
  candidate: { date: string; time: string; area: Area; guests: number },
  opts: { excludeReservationId?: string } = {}
): string | null {
  // Per-reservation cap on the bar (independent of total bar capacity).
  if (candidate.area === 'bar' && candidate.guests > MAX_BAR_PARTY) {
    return `על הבר אפשר להזמין עד ${MAX_BAR_PARTY} סועדים בלבד. לקבוצה גדולה יותר נא לבחור שולחן.`
  }

  const map = computeAvailability(reservations, candidate.date, opts)
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
