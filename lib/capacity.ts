// ─── Venue capacity + availability math ──────────────────────────────────────
//
// The restaurant is modelled as two capacity zones:
//   • `bar`   — stools at the bar counter.
//   • `table` — seats across the window tables + sofa area (fluid between
//               them; the hostess may move tables around physically, but the
//               total seat pool for booking purposes is fixed).
//
// Each reservation occupies `guests` seats in its zone for
// RESERVATION_DURATION_MINUTES (120 min by default) starting at its `time`.
// A new reservation is allowed iff the running sum of occupied seats in its
// zone, during its 120-min window, plus the candidate's guest count, does
// not exceed the zone capacity.
//
// Zone capacity numbers + the per-reservation bar cap live in the `zones` DB
// table (see lib/zones.ts + supabase-migration-zones.sql) — they used to be
// env vars, but moved so the owner can tune them live. Functions in this
// file take a `ZoneConfig` argument so the math stays pure: DB fetching is
// the caller's job (an API route), and tests can pass a fixture directly.

import type { ZoneConfig } from '@/lib/zones'

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
  maxBarParty: number
  durationMinutes: number
}

// Number of guests currently occupying each zone at `time` on `date`.
// A reservation "occupies" its zone from `time` to `time + duration` and is
// counted only if its status is in OCCUPYING_STATUSES. Walk-ins count the
// same way because their status is 'arrived' (one of the occupying set).
//
// This is the single source of truth for zone usage. Both the per-slot
// availability map (customer form) and the single-slot capacity gate
// (POST /api/reservations, walk-ins) call it.
export function computeUsageAt(
  reservations: ReservationLike[],
  date: string,
  time: string,
  opts: { excludeReservationId?: string; durationMinutes?: number } = {},
): { bar: number; table: number } {
  const duration = opts.durationMinutes ?? RESERVATION_DURATION_MINUTES
  const slotMin = timeToMinutes(time)
  let bar = 0
  let table = 0
  for (const r of reservations) {
    if (r.date !== date) continue
    if (!OCCUPYING_STATUSES.has(r.status)) continue
    if (opts.excludeReservationId && r.id === opts.excludeReservationId) continue
    const start = timeToMinutes(r.time)
    const end = start + duration
    // Inclusive start, exclusive end — a reservation at 19:00 with duration
    // 120 occupies 19:00..20:59 and releases its seats at 21:00 sharp.
    if (slotMin >= start && slotMin < end) {
      if (r.area === 'bar') bar += r.guests
      else table += r.guests
    }
  }
  return { bar, table }
}

export function computeAvailability(
  reservations: ReservationLike[],
  date: string,
  config: ZoneConfig,
  opts: { excludeReservationId?: string } = {}
): AvailabilityMap {
  const duration = RESERVATION_DURATION_MINUTES
  const bar: Record<string, number> = {}
  const table: Record<string, number> = {}

  for (const slot of VALID_TIMES) {
    const usage = computeUsageAt(reservations, date, slot, opts)
    bar[slot] = Math.max(0, config.bar.capacity - usage.bar)
    table[slot] = Math.max(0, config.table.capacity - usage.table)
  }

  return {
    bar,
    table,
    capacity: { bar: config.bar.capacity, table: config.table.capacity },
    maxBarParty: config.bar.maxPartySize,
    durationMinutes: duration,
  }
}

// ── Real-floor capacity (admin floor-load strip) ─────────────────────────────
//
// Unlike computeAvailability above (which uses the zone capacity pool), this
// function sums the actual `capacity_max` of active restaurant_tables rows.
// The floor-load strip on the shift screen uses this to show booked vs real
// seats per 30-min bucket.

export interface FloorTable {
  id: string
  capacityMax: number
  active: boolean
}

export type FloorBucketStatus = 'ok' | 'tight' | 'over'

export interface FloorBucket {
  start: string       // HH:mm
  bookedGuests: number
  realCapacity: number
  status: FloorBucketStatus
}

export const DEFAULT_FLOOR_BUCKETS: string[] = [
  '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00', '22:30', '23:00',
]

export function computeFloorCapacityAt(
  reservations: ReservationLike[],
  tables: FloorTable[],
  date: string,
  opts: { buckets?: string[]; durationMinutes?: number } = {},
): FloorBucket[] {
  const buckets = opts.buckets ?? DEFAULT_FLOOR_BUCKETS
  const duration = opts.durationMinutes ?? RESERVATION_DURATION_MINUTES
  const realCapacity = tables
    .filter(t => t.active)
    .reduce((s, t) => s + t.capacityMax, 0)

  const active = reservations.filter(
    r => r.date === date && OCCUPYING_STATUSES.has(r.status),
  )

  return buckets.map(slot => {
    const slotMin = timeToMinutes(slot)
    let booked = 0
    for (const r of active) {
      const start = timeToMinutes(r.time)
      const end = start + duration
      if (slotMin >= start && slotMin < end) booked += r.guests
    }
    let status: FloorBucketStatus = 'ok'
    if (booked > realCapacity) status = 'over'
    else if (realCapacity > 0 && booked >= realCapacity * 0.9) status = 'tight'
    return { start: slot, bookedGuests: booked, realCapacity, status }
  })
}

// Single-slot variant used by the POST handler before creating a reservation,
// and by PATCH to check if an update would violate capacity. Unlike the
// customer form's AvailabilityMap, this one accepts ANY HH:MM time — walk-ins
// arrive at arbitrary minutes (e.g. 20:37) and must be capacity-checked
// at the same zone level.
//
// Returns `null` if there's room, or a human-readable Hebrew reason if not.
export function checkSlotAvailability(
  reservations: ReservationLike[],
  candidate: { date: string; time: string; area: Area; guests: number },
  config: ZoneConfig,
  opts: { excludeReservationId?: string } = {}
): string | null {
  // Per-reservation cap on the bar (independent of total bar capacity).
  const barMax = config.bar.maxPartySize
  if (candidate.area === 'bar' && candidate.guests > barMax) {
    return `על הבר אפשר להזמין עד ${barMax} סועדים בלבד. לקבוצה גדולה יותר נא לבחור שולחן.`
  }

  // Per-reservation cap on table (usually null = no cap, but honour it if set).
  const tableMax = config.table.maxPartySize
  if (candidate.area === 'table' && tableMax !== null && candidate.guests > tableMax) {
    return `לשולחן אפשר להזמין עד ${tableMax} סועדים בלבד.`
  }

  // Accept any valid HH:MM — walk-ins arrive at 20:37, 22:45, etc.
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(candidate.time)) {
    return 'שעה לא תקינה'
  }

  const usage = computeUsageAt(reservations, candidate.date, candidate.time, opts)
  const capacity = candidate.area === 'bar' ? config.bar.capacity : config.table.capacity
  const used = candidate.area === 'bar' ? usage.bar : usage.table
  const remaining = Math.max(0, capacity - used)
  if (remaining < candidate.guests) {
    if (remaining === 0) {
      return 'אין מקום פנוי בשעה זו. נא לבחור שעה אחרת.'
    }
    return `נותרו ${remaining} מקומות בלבד בשעה זו. נא לבחור מספר סועדים קטן יותר או שעה אחרת.`
  }
  return null
}
