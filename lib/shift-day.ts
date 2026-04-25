// Shared shift-day computation used by both API routes.
// The hostess's "today" isn't the calendar day — it's the shift day. A shift
// that opens at, say, Monday 19:00 keeps its Monday identity until 04:00
// Tuesday morning, at which point the dashboard rolls forward to Tuesday.
// This matches how the restaurant actually thinks about a service night.
//
// We compute this in Asia/Jerusalem regardless of where the server runs:
// subtract 4 hours from "now", then format the resulting instant as a
// YYYY-MM-DD in Israel local time. That single transformation expresses
// "the 4am cutoff lives at Israel local midnight + 4h".

const SHIFT_CUTOFF_HOURS = 4

// Customers can no longer book the current shift day once this Israel-local
// hour has been reached. The restaurant starts receiving guests at 19:00, and
// after that point the hostess owns floor allocation (walk-ins, table shuffles,
// etc.) — letting customers sneak in last-minute bookings at 19:30 creates
// race conditions with seating she's already committed to verbally. Staff
// (admin / host cookies) bypass this gate; it applies to the public form only.
export const SAME_DAY_BOOKING_CUTOFF_HOUR = 19

export function shiftDayLocal(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - SHIFT_CUTOFF_HOURS * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

// Return the current calendar date + wall-clock hour in Israel time.
// Used to check whether we've crossed the 19:00 same-day cutoff.
function israelCalendarParts(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(now)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  const h = Number(parts.find(p => p.type === 'hour')!.value)
  return { date: `${y}-${m}-${d}`, hour: h }
}

// Returns true iff `bookingDate` refers to the shift currently in progress and
// we're past the 19:00 Israel-time cutoff. This is the "same-day booking
// window has closed" gate used by the customer-facing form + POST handler.
//
// Two cases make the gate fire:
//   1. The calendar date in Israel still matches the shift day AND the wall
//      clock is >= 19:00  (e.g. 20:30 same evening).
//   2. The calendar date has already advanced past the shift day (shift
//      ends at 04:00 the next morning — at 02:00 we're still on shift D,
//      but the calendar is already D+1 and we're well past 19:00 of D).
export function isSameDayBookingClosed(
  bookingDate: string,
  now: Date = new Date(),
): boolean {
  const shiftDay = shiftDayLocal(now)
  if (bookingDate !== shiftDay) return false
  const { date: calendarDate, hour } = israelCalendarParts(now)
  if (calendarDate !== shiftDay) return true
  return hour >= SAME_DAY_BOOKING_CUTOFF_HOUR
}
