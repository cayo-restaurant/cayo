// Per-table live status for the map's Live mode.
//
// Given all reservations loaded for tonight and the current moment, decide
// whether each table is `occupied` (someone has arrived and is still in
// their window), `reserved_soon` (a pending/confirmed booking starts in
// the next 90 min), or `free`. The hostess sees one color per table on
// the map. The classifier is pure so it's trivial to unit-test.

import { RESERVATION_DURATION_MINUTES } from './capacity'

export type ReservationStatus =
  | 'pending' | 'confirmed' | 'cancelled' | 'arrived' | 'no_show' | 'completed'

export type LiveTableStatus = 'occupied' | 'reserved_soon' | 'free'

// Minimal shape the classifier needs. The wider Reservation type used by
// the admin UI already has all of these fields.
export interface ReservationForLive {
  id: string
  name: string
  date: string            // YYYY-MM-DD (Israel TZ, shift-day)
  time: string            // HH:mm (Israel TZ)
  status: ReservationStatus
  guests: number
  tables: { id: string }[]
}

export interface LiveTableRow {
  reservationId: string
  name: string
  time: string
  guests: number
  status: ReservationStatus
  initials: string
}

export interface TableLiveState {
  tableId: string
  status: LiveTableStatus
  rows: LiveTableRow[]       // today's reservations on this table, time-sorted
  next: LiveTableRow | null  // first not-yet-arrived row after `now`
}

const OCCUPYING = new Set<ReservationStatus>(['pending', 'confirmed', 'arrived'])
const SOON_WINDOW_MIN = 90

// Inline twin of app/host/shared.tsx:timeOn — pure, avoids importing
// a 'use client' module into server-testable code.
function timeOn(dateStr: string, time: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h - 2, m, 0, 0))
}

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return parts[0][0] + parts[1][0]
}

export function classifyTable(
  tableId: string,
  reservations: ReservationForLive[],
  now: Date,
  shiftDate: string,
): TableLiveState {
  const nowMs = now.getTime()
  const durationMs = RESERVATION_DURATION_MINUTES * 60 * 1000
  const soonWindowMs = SOON_WINDOW_MIN * 60 * 1000

  const onTable = reservations.filter(
    r =>
      r.date === shiftDate &&
      OCCUPYING.has(r.status) &&
      r.tables.some(t => t.id === tableId),
  )

  const rows: LiveTableRow[] = onTable
    .map(r => ({
      reservationId: r.id,
      name: r.name,
      time: r.time,
      guests: r.guests,
      status: r.status,
      initials: initialsOf(r.name),
    }))
    .sort((a, b) => timeOn(shiftDate, a.time).getTime() - timeOn(shiftDate, b.time).getTime())

  let status: LiveTableStatus = 'free'
  let next: LiveTableRow | null = null

  for (const r of onTable) {
    const startMs = timeOn(r.date, r.time).getTime()
    if (r.status === 'arrived' && nowMs >= startMs && nowMs < startMs + durationMs) {
      status = 'occupied'
    } else if (
      status !== 'occupied' &&
      (r.status === 'pending' || r.status === 'confirmed') &&
      startMs > nowMs &&
      startMs - nowMs <= soonWindowMs
    ) {
      status = 'reserved_soon'
    }
  }

  // `next` = earliest not-yet-arrived row starting after `now`.
  for (const r of rows) {
    if (r.status === 'arrived') continue
    const startMs = timeOn(shiftDate, r.time).getTime()
    if (startMs > nowMs) { next = r; break }
  }

  return { tableId, status, rows, next }
}
