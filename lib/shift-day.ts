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

export function shiftDayLocal(): string {
  const shifted = new Date(Date.now() - SHIFT_CUTOFF_HOURS * 60 * 60 * 1000)
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
