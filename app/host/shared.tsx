'use client'

// Shared types, helpers, and the ReservationRow component used by the
// on-shift hostess surfaces: /host (active queue) and /host/marked
// (reservations already marked arrived / no-show).
import { useEffect, useRef, useState } from 'react'

export type Status = 'pending' | 'confirmed' | 'cancelled' | 'arrived' | 'no_show' | 'completed'
export type Area = 'bar' | 'table'

// Host surfaces now expose the assignment picker inside the expanded drawer
// (Phase 1.5). The shape mirrors what the admin card consumes so the same
// TablePickerModal can be reused. See ReservationRow's `onAssign` prop.
export interface AssignedTable {
  id: string
  tableNumber: number
  label: string | null
  area: Area
  capacityMin: number
  capacityMax: number
  isPrimary: boolean
}

// Raw shape returned by GET /api/admin/map/tables. We mirror it exactly
// (snake_case, matching the DB column names) to avoid a translation layer
// inside the recommendation engine. ReservationRow only displays
// `table_number`, and the API contract we already ship in
// POST /reservations/[id]/tables only needs `id`.
export interface TableLite {
  id: string
  table_number: number
  label: string | null
  area: Area
  capacity_min: number
  capacity_max: number
}

export interface Reservation {
  id: string
  name: string
  date: string
  time: string
  area: Area
  guests: number
  phone: string
  email: string
  status: Status
  notes?: string
  createdAt: string
  updatedAt: string
  tables: AssignedTable[]
}

// A confirmed reservation is considered "late" this many minutes after its
// scheduled time if it hasn't been marked arrived/no_show yet.
export const LATE_THRESHOLD_MIN = 15

export const STATUS_LABEL: Record<Status, string> = {
  pending: 'ממתין',
  confirmed: 'מאושר',
  cancelled: 'בוטל',
  arrived: 'הגיע/ה',
  no_show: 'לא הגיע/ה',
  completed: 'הסתיים',
}

export const AREA_LABEL: Record<Area, string> = {
  bar: 'בר',
  table: 'שולחן',
}

export const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

export function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

export function toDateString(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Compute the current time in Asia/Jerusalem timezone (for late-detection and shift-day math).
// Returns the Date object adjusted to reflect the current Israel local time.
function getNowInIsraelTime(): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  
  const parts = formatter.formatToParts(new Date())
  const get = (type: string) => {
    const part = parts.find(p => p.type === type)
    return part ? parseInt(part.value, 10) : 0
  }
  
  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
}

// The hostess's "today" is the shift day: before 04:00 she's still on the
// previous calendar day's shift. Compute in Asia/Jerusalem time zone.
export function shiftAdjustedDate(now: Date): Date {
  const d = new Date(now)
  if (d.getHours() < 4) {
    d.setDate(d.getDate() - 1)
  }
  return d
}

export function computeShiftDateStr(now: Date): string {
  // Compute in Israel time, not browser local time
  const israelNow = getNowInIsraelTime()
  return toDateString(shiftAdjustedDate(israelNow))
}

// Convert a "HH:mm" string + a reference date into a Date in Israel time.
// This ensures late-detection math is done in the correct timezone.
export function timeOn(dateStr: string, time: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  // Create a UTC Date, then interpret it as Israel time
  // (we're assuming dateStr and time are in Israel timezone per the server)
  return new Date(Date.UTC(y, mo - 1, d, h - 2, m, 0, 0))
}

export function minutesDiff(a: number, b: number): number {
  return Math.round((a - b) / 60000)
}

export type Bucket = 'late' | 'soon' | 'upcoming' | 'arrived' | 'no_show' | 'other'

export interface Enriched extends Reservation {
  scheduled: Date
  minutesFromNow: number
  lateMinutes: number
  bucket: Bucket
  // Null when no single active table fits this party, or when every
  // fitting table has an overlapping reservation in its 2h window, or
  // when the reservation already has an assignment / isn't in a
  // seat-able state. Powers the one-tap "שבצי שולחן N" shortcut on the
  // host pill.
  recommendedTable: TableLite | null
}

// Shift-long seating window — if two reservations' start times are within
// this many minutes of each other, they're considered to overlap on the
// same table. Same constant the TablePickerModal uses for its conflict
// hint; kept in sync by being declared in one place.
const RESERVATION_WINDOW_MIN = 120

const OCCUPYING_STATUSES = new Set<Status>(['pending', 'confirmed', 'arrived'])

function minutesFromClockTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function startTimesOverlap(aTime: string, bTime: string): boolean {
  return Math.abs(minutesFromClockTime(aTime) - minutesFromClockTime(bTime)) < RESERVATION_WINDOW_MIN
}

// True if any OTHER occupying reservation on the same date holds this
// table within the 2h overlap window. Used by the recommendation engine
// to skip tables that would create a double-booking.
function tableIsConflicted(
  tableId: string,
  target: Reservation,
  all: Reservation[],
): boolean {
  for (const r of all) {
    if (r.id === target.id) continue
    if (r.date !== target.date) continue
    if (!OCCUPYING_STATUSES.has(r.status)) continue
    if (!r.tables.some(t => t.id === tableId)) continue
    if (!startTimesOverlap(r.time, target.time)) continue
    return true
  }
  return false
}

// Which table should the "שבצי שולחן N" shortcut assign?
//   - Only for confirmed reservations with no existing assignment.
//   - Candidates = active tables whose max capacity fits the party.
//   - Skip any candidate already held by an overlapping reservation.
//   - Among survivors, prefer the SMALLEST capacity_max (least wasted
//     seats). Ties broken by lowest table_number for stability — the
//     same reservation loaded twice should never flip its recommendation.
//   - Returns null when nothing fits. The caller falls back to the
//     classic "⚠ ללא שולחן · שייך" orange pill so the hostess can build
//     a combo manually.
export function recommendedTable(
  reservation: Reservation,
  allTables: TableLite[],
  allReservations: Reservation[],
): TableLite | null {
  if (reservation.status !== 'confirmed') return null
  if (reservation.tables.length > 0) return null

  const fitting = allTables
    .filter(t => t.capacity_max >= reservation.guests)
    .filter(t => !tableIsConflicted(t.id, reservation, allReservations))

  if (fitting.length === 0) return null

  fitting.sort((a, b) => {
    if (a.capacity_max !== b.capacity_max) return a.capacity_max - b.capacity_max
    return a.table_number - b.table_number
  })

  return fitting[0]
}

export function bucketOf(r: Reservation, now: number): { bucket: Bucket; lateMinutes: number } {
  const scheduled = timeOn(r.date, r.time).getTime()
  const mins = minutesDiff(now, scheduled) // positive if past

  if (r.status === 'arrived') return { bucket: 'arrived', lateMinutes: 0 }
  if (r.status === 'no_show') return { bucket: 'no_show', lateMinutes: 0 }
  if (r.status === 'cancelled' || r.status === 'pending' || r.status === 'completed') {
    // Completed reservations already left — they don't belong in any of the
    // active hostess buckets. Route them to "other" so the host views ignore
    // them just like cancelled/pending.
    return { bucket: 'other', lateMinutes: 0 }
  }
  // status === 'confirmed' from here
  if (mins >= LATE_THRESHOLD_MIN) return { bucket: 'late', lateMinutes: mins }
  if (mins >= -30) return { bucket: 'soon', lateMinutes: 0 }
  return { bucket: 'upcoming', lateMinutes: 0 }
}

// `allTables` is optional so that consumers that don't need
// recommendations (MarkedDashboard, early-load states before the tables
// fetch returns) don't have to thread an empty array through. When it's
// missing or empty, `recommendedTable` for every row resolves to null —
// the classic orange "שייך" pill renders instead.
export function enrich(
  items: Reservation[],
  now: number,
  allTables: TableLite[] = [],
): Enriched[] {
  return items.map(r => {
    const scheduled = timeOn(r.date, r.time)
    const { bucket, lateMinutes } = bucketOf(r, now)
    return {
      ...r,
      scheduled,
      minutesFromNow: minutesDiff(scheduled.getTime(), now),
      lateMinutes,
      bucket,
      recommendedTable:
        allTables.length > 0 ? recommendedTable(r, allTables, items) : null,
    }
  })
}

// Compact list row. Tap to expand (shows phone + notes). Swipe right to
// reveal the two primary actions (arrived / no-show).
//
// `onAssign` is optional — when supplied, the expanded drawer renders an
// assignment pill that opens the TablePickerModal. The pill is hidden on
// reservations that are no_show / cancelled / completed (where a seating
// decision no longer makes sense). We intentionally keep the pill inside
// the expanded drawer (not the compact header) so the shift view stays
// glanceable and dense.
export function ReservationRow({
  reservation: r,
  pending,
  onArrived,
  onNoShow,
  onUndo,
  onAssign,
  onQuickAssign,
}: {
  reservation: Enriched
  pending: boolean
  onArrived: () => void
  onNoShow: () => void
  onUndo: () => void
  onAssign?: () => void
  // Optional: when supplied AND the reservation has a recommendation,
  // the drawer shows a big one-tap "שבצי שולחן N" button that calls
  // this with the recommended table's id. A small secondary button
  // beside it opens the full picker via `onAssign` for overrides.
  onQuickAssign?: (tableId: string) => void
}) {
  const isLate = r.bucket === 'late'
  const isArrived = r.status === 'arrived'
  const isNoShow = r.status === 'no_show'
  const isSoon = r.bucket === 'soon'
  const isDone = isArrived || isNoShow

  const [expanded, setExpanded] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasTransition, setHasTransition] = useState(true)

  const OPEN_OFFSET = 180
  const drag = useRef({
    active: false,
    decided: 'idle',
    startX: 0,
    startY: 0,
    baseOffset: 0,
    didMove: false,
  })

  useEffect(() => {
    if (isDone) {
      setHasTransition(true)
      setOffset(0)
      setExpanded(false)
    }
  }, [isDone])

  function onTouchStart(e: React.TouchEvent) {
    if (isDone) return
    const t = e.touches[0]
    drag.current = {
      active: true,
      decided: 'idle',
      startX: t.clientX,
      startY: t.clientY,
      baseOffset: offset,
      didMove: false,
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const d = drag.current
    if (!d.active) return
    const t = e.touches[0]
    const dx = t.clientX - d.startX
    const dy = t.clientY - d.startY
    if (d.decided === 'idle') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dy) > Math.abs(dx)) {
        d.decided = 'vertical'
        d.active = false
        return
      }
      d.decided = 'horizontal'
      setHasTransition(false)
    }
    if (d.decided !== 'horizontal') return
    d.didMove = true
    let next = d.baseOffset + dx
    if (next < 0) next = next * 0.3
    if (next > OPEN_OFFSET) next = OPEN_OFFSET + (next - OPEN_OFFSET) * 0.3
    setOffset(next)
  }

  function onTouchEnd() {
    const d = drag.current
    if (d.decided === 'horizontal' && d.didMove) {
      setHasTransition(true)
      setOffset(offset > OPEN_OFFSET * 0.35 ? OPEN_OFFSET : 0)
    }
    setTimeout(() => {
      drag.current.didMove = false
    }, 60)
    drag.current.active = false
  }

  function handleCardClick() {
    if (drag.current.didMove) return
    if (offset > 0) {
      setOffset(0)
      return
    }
    setExpanded(e => !e)
  }

  function triggerArrived(e: React.MouseEvent) {
    e.stopPropagation()
    setOffset(0)
    onArrived()
  }
  function triggerNoShow(e: React.MouseEvent) {
    e.stopPropagation()
    setOffset(0)
    onNoShow()
  }
  function triggerUndo(e: React.MouseEvent) {
    e.stopPropagation()
    onUndo()
  }
  function triggerAssign(e: React.MouseEvent) {
    e.stopPropagation()
    if (onAssign) onAssign()
  }
  function triggerQuickAssign(e: React.MouseEvent) {
    e.stopPropagation()
    if (onQuickAssign && r.recommendedTable) onQuickAssign(r.recommendedTable.id)
  }
  // Combined "arrived + assign recommended table" — chains the two
  // existing handlers. Only surfaced when the guest is likely here now
  // (late / soon buckets). Both API calls fire; if either errors the
  // individual handler's own load() fallback corrects state.
  function triggerArriveAndAssign(e: React.MouseEvent) {
    e.stopPropagation()
    if (onQuickAssign && r.recommendedTable) onQuickAssign(r.recommendedTable.id)
    onArrived()
  }

  // The assignment pill is only meaningful while a seating decision is
  // live — confirmed (upcoming/soon/late) or arrived. Once the guest is
  // flagged no_show / cancelled / completed the pill disappears.
  const canAssign = Boolean(onAssign) && (r.status === 'confirmed' || r.status === 'arrived')
  const primaryTable =
    r.tables.find(t => t.isPrimary) ?? (r.tables.length > 0 ? r.tables[0] : null)
  const extraTablesCount = r.tables.length > 1 ? r.tables.length - 1 : 0
  // "Smart shortcut" pill: we have a recommendation AND the parent wired
  // a quick-assign handler AND the row is still unassigned. Otherwise
  // fall back to the classic orange "שייך" pill that opens the picker.
  const showQuickAssign = Boolean(
    canAssign && !primaryTable && r.recommendedTable && onQuickAssign,
  )

  const isVeryLate = isLate && r.lateMinutes >= 30

  const rowCls = isVeryLate
    ? 'border-cayo-red bg-cayo-red/5'
    : isLate
    ? 'border-cayo-orange bg-cayo-orange/5'
    : isArrived
    ? 'border-cayo-teal/40 bg-cayo-teal/5'
    : isNoShow
    ? 'border-black/15 bg-black/5 opacity-75'
    : isSoon
    ? 'border-cayo-orange/50 bg-cayo-orange/5'
    : 'border-cayo-burgundy/15 bg-white'

  const timeBadgeCls = isVeryLate
    ? 'bg-cayo-red text-white'
    : isLate
    ? 'bg-cayo-orange text-white'
    : isArrived
    ? 'bg-cayo-teal/20 text-cayo-teal'
    : isNoShow
    ? 'bg-black/15 text-black/60'
    : isSoon
    ? 'bg-cayo-orange/20 text-cayo-orange'
    : 'bg-cayo-burgundy/10 text-cayo-burgundy'

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 ${rowCls} ${
        pending ? 'opacity-70' : ''
      }`}
    >
      {!isDone && (
        <div
          className="absolute inset-y-0 left-0 flex"
          style={{ width: OPEN_OFFSET }}
          aria-hidden={offset === 0}
        >
          <button
            onClick={triggerNoShow}
            disabled={pending}
            className="flex-1 bg-cayo-burgundy text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
            aria-label="סמני לא הגיע"
          >
            <span className="text-2xl leading-none">✗</span>
            <span>לא הגיע</span>
          </button>
          <button
            onClick={triggerArrived}
            disabled={pending}
            className="flex-1 bg-cayo-teal text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
            aria-label="סמני הגיע"
          >
            <span className="text-2xl leading-none">✓</span>
            <span>הגיע</span>
          </button>
        </div>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleCardClick}
        className="relative bg-inherit select-none cursor-pointer"
        style={{
          transform: `translateX(${offset}px)`,
          transition: hasTransition ? 'transform 220ms ease-out' : 'none',
          touchAction: 'pan-y',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={`rounded-lg px-2.5 py-1.5 text-center min-w-[60px] ${timeBadgeCls}`}
          >
            <p className="text-lg font-black leading-none" dir="ltr">
              {r.time}
            </p>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-cayo-burgundy truncate leading-tight">
              {r.name || '— ללא שם —'}
            </p>
            <div className="flex items-center gap-1.5 text-xs font-bold text-cayo-burgundy/65 mt-0.5 truncate">
              <span>
                {r.guests} {r.guests === 1 ? 'סועד' : 'סועדים'}
              </span>
              <span className="opacity-40">·</span>
              <span>{AREA_LABEL[r.area]}</span>
              {isLate && (
                <>
                  <span className="opacity-40">·</span>
                  <span className={`${isVeryLate ? 'text-cayo-red' : 'text-cayo-orange'} font-black`}>
                    איחור {r.lateMinutes} דק׳
                  </span>
                </>
              )}
              {isSoon && !isLate && r.minutesFromNow > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="text-cayo-orange">
                    בעוד {r.minutesFromNow} דק׳
                  </span>
                </>
              )}
              {isArrived && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="text-cayo-teal">הגיע/ה</span>
                </>
              )}
              {isNoShow && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="text-black/60">לא הגיע/ה</span>
                </>
              )}
            </div>
          </div>

          {isLate && r.phone && (
            // Direct-dial pill for late reservations — the single most
            // time-sensitive action on the shift. Lives on the collapsed
            // row so the hostess can tap without expanding. `tel:` links
            // open the native dialer on mobile. stopPropagation so the
            // card doesn't also expand.
            <a
              href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
              onClick={e => e.stopPropagation()}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-black shrink-0 active:scale-95 transition-transform ${
                isVeryLate ? 'bg-cayo-red text-white' : 'bg-cayo-orange text-white'
              }`}
              aria-label={`התקשרי ל-${r.name || 'הזמנה'}`}
            >
              <span className="text-base leading-none">📞</span>
              <span>התקשרי</span>
            </a>
          )}

          <span
            className="text-cayo-burgundy/40 text-xs font-black px-1"
            aria-hidden="true"
          >
            {expanded ? '▲' : '▼'}
          </span>
        </div>

        {expanded && (
          <div className="px-4 pb-3 pt-1 border-t border-cayo-burgundy/10 space-y-2">
            {canAssign && showQuickAssign && r.recommendedTable && (
              // Split pill: big one-tap action on the right (primary CTA)
              // and a small "אחר" escape hatch that opens the full picker
              // when the suggestion isn't what the hostess wants.
              //
              // Bucket-aware primary:
              //   late / soon  → "✓ הגיע · שולחן N" (guest is here now;
              //                   chain arrive + assign in one tap)
              //   upcoming     → "🪑 שבצי שולחן N" (pre-plan only; don't
              //                   mark arrived before the guest walks in)
              // Either way the "אחר" button opens the picker, which only
              // assigns — so pre-plan-later-in-the-shift is still a thing
              // the hostess can do for late/soon rows via the picker.
              (() => {
                const combine = r.bucket === 'late' || r.bucket === 'soon'
                return (
                  <div className="flex gap-1.5">
                    <button
                      onClick={combine ? triggerArriveAndAssign : triggerQuickAssign}
                      disabled={pending}
                      className={`flex-1 h-11 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 text-white border-2 ${
                        combine
                          ? 'bg-cayo-teal border-cayo-teal'
                          : 'bg-cayo-burgundy border-cayo-burgundy'
                      }`}
                      aria-label={
                        combine
                          ? `הגיע ושבצי לשולחן ${r.recommendedTable!.table_number}`
                          : `שבצי שולחן ${r.recommendedTable!.table_number}`
                      }
                    >
                      <span>{combine ? '✓' : '🪑'}</span>
                      <span>
                        {combine
                          ? `הגיע · שולחן ${r.recommendedTable!.table_number}`
                          : `שבצי שולחן ${r.recommendedTable!.table_number}`}
                      </span>
                    </button>
                    <button
                      onClick={triggerAssign}
                      disabled={pending}
                      className="w-16 h-11 rounded-xl font-black text-sm flex items-center justify-center active:scale-[0.98] transition-transform disabled:opacity-50 bg-cayo-burgundy/5 text-cayo-burgundy/80 border-2 border-cayo-burgundy/20"
                      aria-label="בחרי שולחן אחר או שילוב"
                    >
                      אחר
                    </button>
                  </div>
                )
              })()
            )}
            {canAssign && !showQuickAssign && (
              <button
                onClick={triggerAssign}
                disabled={pending}
                className={`w-full h-11 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 ${
                  primaryTable
                    ? 'bg-cayo-burgundy/10 text-cayo-burgundy border-2 border-cayo-burgundy/20'
                    : 'bg-cayo-orange/15 text-cayo-orange border-2 border-cayo-orange/30'
                }`}
                aria-label={primaryTable ? 'שינוי שיוך שולחן' : 'שיוך שולחן'}
              >
                {primaryTable ? (
                  <>
                    <span>🪑</span>
                    <span>
                      שולחן {primaryTable.tableNumber}
                      {extraTablesCount > 0 && (
                        <span className="font-bold opacity-70"> +{extraTablesCount}</span>
                      )}
                    </span>
                    <span className="opacity-50">·</span>
                    <span className="text-xs opacity-80">עריכה</span>
                  </>
                ) : (
                  <>
                    <span>⚠</span>
                    <span>ללא שולחן</span>
                    <span className="opacity-50">·</span>
                    <span className="text-xs opacity-80">שייך</span>
                  </>
                )}
              </button>
            )}

            {(r.phone || r.notes) ? (
              <>
                {r.phone && (
                  <a
                    href={`tel:${r.phone}`}
                    onClick={e => e.stopPropagation()}
                    dir="ltr"
                    className={`w-full h-11 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
                      isVeryLate
                        ? 'bg-cayo-red text-white'
                        : isLate
                        ? 'bg-cayo-orange text-white'
                        : 'bg-cayo-burgundy text-white'
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    <span>{r.phone}</span>
                  </a>
                )}
                {r.notes && (
                  <p className="text-sm text-cayo-burgundy/80 italic bg-cayo-burgundy/5 rounded-lg px-3 py-2 leading-snug">
                    💬 {r.notes}
                  </p>
                )}
              </>
            ) : (
              // Hide the "no extra details" fallback when the assignment
              // pill is visible — the drawer isn't empty anymore.
              !canAssign && (
                <p className="text-xs text-cayo-burgundy/45 text-center py-1.5 font-bold">
                  אין פרטים נוספים
                </p>
              )
            )}

            {isDone && (
              <button
                onClick={triggerUndo}
                disabled={pending}
                className="w-full h-10 rounded-xl border-2 border-cayo-burgundy/20 text-cayo-burgundy/70 font-bold text-xs hover:border-cayo-burgundy/50 disabled:opacity-50"
              >
                ↶ ביטול סימון
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
