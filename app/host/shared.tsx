'use client'

// Shared types, helpers, and the ReservationRow component used by the
// on-shift hostess surfaces: /host (active queue) and /host/marked
// (reservations already marked arrived / no-show).
import React, { useEffect, useRef, useState } from 'react'
import { VALID_TIMES } from '@/lib/capacity'

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
  internalNotes?: string
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

// Physical zones inside the restaurant. These are derived from the
// table_number so the hostess always sees tables grouped the same way
// she thinks about the room (ויטרינה / ספות / בר) without needing a
// schema migration. Anything outside the defined ranges falls back to
// 'other' so nothing silently disappears from the picker.
export type Zone = 'window' | 'sofas' | 'bar' | 'other'

export const ZONE_LABEL: Record<Zone, string> = {
  window: 'ויטרינה',
  sofas: 'ספות',
  bar: 'בר',
  other: 'אחר',
}

// Order zones appear in every picker (right-to-left reading: ויטרינה first).
export const ZONE_ORDER: Zone[] = ['window', 'sofas', 'bar', 'other']

export function tableZone(tableNumber: number): Zone {
  if (tableNumber >= 1 && tableNumber <= 15) return 'window'
  if (tableNumber >= 20 && tableNumber <= 25) return 'sofas'
  if (tableNumber >= 101 && tableNumber <= 110) return 'bar'
  return 'other'
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

// Compact list row. Swipe right to reveal arrived/no-show actions.
// Tap anywhere on the card to open the detail modal.
export function ReservationRow({
  reservation: r,
  pending,
  onArrived,
  onNoShow,
  onUndo,
  onEdit,
}: {
  reservation: Enriched
  pending: boolean
  onArrived: () => void
  onNoShow: () => void
  onUndo: () => void
  onEdit: () => void
}) {
  const isLate = r.bucket === 'late'
  const isArrived = r.status === 'arrived'
  const isNoShow = r.status === 'no_show'
  const isSoon = r.bucket === 'soon'
  const isDone = isArrived || isNoShow

  const [offset, setOffset] = useState(0)
  const [hasTransition, setHasTransition] = useState(true)

  const OPEN_OFFSET = 180
  const justMarked = useRef(false)

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
      // Expanded collapse is owned by the parent now; it watches for
      // status transitions and nulls expandedId when this row is done.
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
    if (justMarked.current) return
    if (offset > 0) {
      setOffset(0)
      return
    }
    onEdit()
  }

  function triggerArrived(e: React.MouseEvent) {
    e.stopPropagation()
    justMarked.current = true
    setTimeout(() => { justMarked.current = false }, 500)
    setOffset(0)
    onArrived()
  }
  function triggerNoShow(e: React.MouseEvent) {
    e.stopPropagation()
    justMarked.current = true
    setTimeout(() => { justMarked.current = false }, 500)
    setOffset(0)
    onNoShow()
  }
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
            className="flex-1 bg-cayo-burgundy text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
            aria-label={`סמני לא הגיע – ${r.name || 'ללא שם'} בשעה ${r.time}`}
          >
            <span className="text-2xl leading-none" aria-hidden="true">✗</span>
            <span>לא הגיע</span>
          </button>
          <button
            onClick={triggerArrived}
            disabled={pending}
            className="flex-1 bg-cayo-tealDark text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
            aria-label={`סמני הגיע – ${r.name || 'ללא שם'} בשעה ${r.time}`}
          >
            <span className="text-2xl leading-none" aria-hidden="true">✓</span>
            <span>הגיע</span>
          </button>
        </div>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleCardClick}
        className="relative bg-white select-none cursor-pointer"
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
            <div className="flex items-center gap-1.5 text-xs font-bold text-cayo-burgundy/80 mt-0.5 truncate">
              <span>
                {r.guests} {r.guests === 1 ? 'סועד' : 'סועדים'}
              </span>
              <span className="opacity-40" aria-hidden="true">·</span>
              <span>
                {r.tables.length > 0
                  ? `${AREA_LABEL[r.area]} ${r.tables.map(t => t.tableNumber).sort((a, b) => a - b).join(', ')}`
                  : AREA_LABEL[r.area]}
              </span>
              {isArrived && (
                <>
                  <span className="opacity-40" aria-hidden="true">·</span>
                  <span className="text-cayo-teal">הגיע/ה</span>
                </>
              )}
              {isNoShow && (
                <>
                  <span className="opacity-40" aria-hidden="true">·</span>
                  <span className="text-black/60">לא הגיע/ה</span>
                </>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}

// ─── Detail Modal ──────────────────────────────────────────────────────────────
// Opens when the hostess taps a reservation row.
// Shows all fields except arrival status, with edit support (admin only).
export function ReservationDetailModal({
  reservation: r,
  onClose,
  onSaved,
  onAssign,
  onUndo,
  allTables,
  allReservations,
}: {
  reservation: Enriched
  onClose: () => void
  onSaved: (updated: Partial<Reservation>) => void
  onAssign?: () => void
  onUndo?: () => void
  allTables?: TableLite[]
  allReservations?: Reservation[]
}) {
  const isLate = r.bucket === 'late'
  const isVeryLate = isLate && r.lateMinutes >= 30
  const isDone = r.status === 'arrived' || r.status === 'no_show'

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [name, setName] = useState(r.name)
  const [guests, setGuests] = useState(r.guests)
  const [area, setArea] = useState<Area>(r.area)
  const [phone, setPhone] = useState(r.phone || '')
  const [time, setTime] = useState(r.time)
  const [notes, setNotes] = useState(r.notes || '')
  const [internalNotes, setInternalNotes] = useState(r.internalNotes || '')


  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [tableSaving, setTableSaving] = useState(false)
  const [tableError, setTableError] = useState('')
  // Multi-table selection — initialised from the current assignment so the
  // hostess sees what's already booked and can add / remove tables.
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(
    () => new Set(r.tables.map(t => t.id))
  )
  // Accordion: only one zone's grid is visible at a time. Defaults to the
  // zone of the currently-assigned primary table so the hostess lands on
  // the right section when opening the picker on an existing assignment.
  const [expandedZone, setExpandedZone] = useState<Zone | null>(() => {
    const primary = r.tables.find(t => t.isPrimary) ?? r.tables[0]
    return primary ? tableZone(primary.tableNumber) : null
  })

  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

  const availableTables: TableLite[] = (allTables || []).filter(table => {
    if (!(allReservations)) return true
    return !allReservations.some(res => {
      if (res.id === r.id) return false
      if (res.date !== r.date) return false
      if (!((['pending', 'confirmed', 'arrived'] as Status[]).includes(res.status))) return false
      if (!res.tables.some(t => t.id === table.id)) return false
      return Math.abs(toMins(res.time) - toMins(r.time)) < 120
    })
  }).sort((a, b) => a.table_number - b.table_number)

  // Combined capacity of currently-selected tables (from availableTables or
  // from the existing assignment if the table is no longer in availableTables).
  const selectedCapacity =
    availableTables
      .filter(t => selectedTableIds.has(t.id))
      .reduce((s, t) => s + t.capacity_max, 0) +
    r.tables
      .filter(t => !availableTables.some(at => at.id === t.id) && selectedTableIds.has(t.id))
      .reduce((s, t) => s + t.capacityMax, 0)
  const capacityOk = selectedTableIds.size === 0 || selectedCapacity >= guests

  async function saveTableAssignment() {
    const ids = [...selectedTableIds]
    setTableSaving(true)
    setTableError('')
    try {
      if (ids.length === 0) {
        await fetch(`/api/reservations/${r.id}/tables`, { method: 'DELETE' })
        onSaved({ tables: [] })
      } else {
        const res = await fetch(`/api/reservations/${r.id}/tables`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableIds: ids, primaryTableId: ids[0] }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setTableError(data.error || 'שגיאה בשמירה')
          return
        }
        const data = await res.json()
        onSaved({ tables: data.tables || [] })
      }
      setTablePickerOpen(false)
    } catch {
      setTableError('שגיאה בחיבור')
    } finally {
      setTableSaving(false)
    }
  }

  function cancelEdit() {
    setEditing(false)
    setSaveError('')
    setName(r.name)
    setGuests(r.guests)
    setArea(r.area)
    setTime(r.time)
    setPhone(r.phone || '')
    setNotes(r.notes || '')
    setInternalNotes(r.internalNotes || '')
  }

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/reservations/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, guests, area, time, phone, notes, internalNotes }),
      })
      if (res.status === 403) {
        setSaveError('שגיאת הרשאה')
        return
      }
      if (!res.ok) {
        setSaveError('שגיאה בשמירה, נסי שוב')
        return
      }
      onSaved({ name, guests, area, time, phone, notes, internalNotes })
      setEditing(false)
    } catch {
      setSaveError('אין חיבור לשרת')
    } finally {
      setSaving(false)
    }
  }

  const primaryTable = r.tables.find(t => t.isPrimary) ?? (r.tables.length > 0 ? r.tables[0] : null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b-2 ${
          isVeryLate ? 'border-cayo-red/30 bg-cayo-red/5'
          : isLate ? 'border-cayo-orange/30 bg-cayo-orange/5'
          : 'border-cayo-burgundy/10'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-cayo-burgundy leading-tight">
                סיכום הזמנה
              </h2>
              {(() => {
                const d = new Date(r.date + 'T12:00:00')
                const day = HEBREW_DAYS[d.getDay()]
                const date = `${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]}`
                return (
                  <p className="text-xs font-black text-cayo-burgundy mt-0.5">
                    יום {day}, {date}
                  </p>
                )
              })()}
            </div>
            <button
              onClick={onClose}
              className="text-cayo-burgundy/40 hover:text-cayo-burgundy text-xl leading-none p-1 shrink-0"
              aria-label="סגור"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div>
          {/* Name */}
          <div className="px-5 py-3 border-b-2 border-black/15">
            <ModalField label="שם">
              <p className="text-sm font-black text-cayo-burgundy">{r.name || '—'}</p>
            </ModalField>
          </div>

          {/* Guests + Table */}
          <div className="px-5 py-3 grid grid-cols-2 gap-3 border-b-2 border-black/15">
            <ModalField label="סועדים">
              <GuestScrollPicker value={guests} onChange={setGuests} />
            </ModalField>

            <ModalField label="שולחן">
              <div>
                <button
                  onClick={e => { e.stopPropagation(); setTablePickerOpen(o => !o); setTableError('') }}
                  className="text-sm font-black text-cayo-burgundy underline decoration-dotted"
                >
                  {r.tables.length > 0
                    ? r.tables.map(t => t.tableNumber).sort((a, b) => a - b).join(', ')
                    : '—'}
                </button>
                {tablePickerOpen && (
                  <div className="mt-2">
                    {availableTables.length === 0 ? (
                      <p className="text-xs font-bold text-cayo-burgundy/50">אין שולחנות פנויים</p>
                    ) : (
                      <>
                        {/* Zone chips — accordion: one zone open at a time */}
                        <div className="flex gap-1.5 flex-wrap">
                          {ZONE_ORDER.map(zone => {
                            const zoneTables = availableTables.filter(t => tableZone(t.table_number) === zone)
                            if (zoneTables.length === 0) return null
                            const isOpen = expandedZone === zone
                            return (
                              <button
                                key={zone}
                                type="button"
                                onClick={e => { e.stopPropagation(); setExpandedZone(isOpen ? null : zone) }}
                                className={`px-2.5 h-9 rounded-lg border-2 text-xs font-black transition-colors
                                  ${isOpen
                                    ? 'bg-cayo-burgundy text-white border-cayo-burgundy'
                                    : 'border-cayo-burgundy/20 text-cayo-burgundy hover:bg-cayo-burgundy/5'}`}
                                aria-expanded={isOpen}
                              >
                                {ZONE_LABEL[zone]}
                              </button>
                            )
                          })}
                        </div>
                        {expandedZone && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {availableTables
                              .filter(t => tableZone(t.table_number) === expandedZone)
                              .map(t => {
                                const isSel = selectedTableIds.has(t.id)
                                return (
                                  <button
                                    key={t.id}
                                    onClick={e => {
                                      e.stopPropagation()
                                      setSelectedTableIds(prev => {
                                        const next = new Set(prev)
                                        if (next.has(t.id)) next.delete(t.id)
                                        else next.add(t.id)
                                        return next
                                      })
                                    }}
                                    disabled={tableSaving}
                                    className={`w-9 h-9 rounded-lg border-2 text-sm font-black transition-colors disabled:opacity-50
                                      ${isSel
                                        ? 'bg-cayo-burgundy text-white border-cayo-burgundy'
                                        : 'border-cayo-burgundy/20 text-cayo-burgundy hover:bg-cayo-burgundy hover:text-white'}`}
                                  >
                                    {t.table_number}
                                  </button>
                                )
                              })}
                          </div>
                        )}
                        {/* Capacity indicator + save */}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {selectedTableIds.size > 0 ? (
                            <span className={`text-xs font-bold ${capacityOk ? 'text-cayo-teal' : 'text-cayo-red'}`}>
                              {capacityOk
                                ? `קיבולת: ${selectedCapacity} ✓`
                                : `קיבולת: ${selectedCapacity}/${guests} ⚠`}
                            </span>
                          ) : <span />}
                          <button
                            onClick={e => { e.stopPropagation(); saveTableAssignment() }}
                            disabled={tableSaving || (selectedTableIds.size > 0 && !capacityOk)}
                            className="text-xs font-black text-white bg-cayo-tealDark px-3 py-1 rounded-lg disabled:opacity-40 hover:opacity-90 transition"
                          >
                            {tableSaving ? '...' : 'שמור'}
                          </button>
                        </div>
                      </>
                    )}
                    {tableError && (
                      <p className="text-xs font-bold text-cayo-red mt-1.5">{tableError}</p>
                    )}
                  </div>
                )}
              </div>
            </ModalField>
          </div>

          {/* Time + Phone */}
          <div className="px-5 py-3 grid grid-cols-2 gap-3 border-b-2 border-black/15">
            <ModalField label="שעה">
              <select
                value={time}
                onChange={e => setTime(e.target.value)}
                className={`text-sm font-black bg-transparent border-none outline-none cursor-pointer ${isVeryLate ? 'text-cayo-red' : isLate ? 'text-cayo-orange' : 'text-cayo-burgundy'}`}
                dir="ltr"
              >
                {VALID_TIMES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </ModalField>

            <ModalField label="טלפון">
              {r.phone ? (
                <a
                  href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                  className="text-sm font-black text-cayo-burgundy underline"
                  dir="ltr"
                  onClick={e => e.stopPropagation()}
                >
                  {r.phone}
                </a>
              ) : (
                <p className="text-sm font-black text-cayo-burgundy/40">—</p>
              )}
            </ModalField>
          </div>

          {/* Notes */}
          <div className="px-5 py-3 border-b-2 border-black/15">
            <ModalField label="בקשת לקוח">
              <p className="text-sm font-black text-cayo-burgundy/80">{r.notes || '—'}</p>
            </ModalField>
          </div>

          {/* Internal notes — staff only, not shown to customers */}
          <div className="px-5 py-3 border-b-2 border-black/15">
            <ModalField label="הערות למסעדה">
              <textarea
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                placeholder="הערות פנימיות..."
                rows={2}
                className="w-full text-sm font-black text-cayo-burgundy/80 bg-transparent resize-none outline-none placeholder:text-cayo-burgundy/25"
              />
            </ModalField>
          </div>

          {saveError && (
            <div className="px-5 py-2">
              <p className="text-xs font-bold text-cayo-red text-center">{saveError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex flex-col gap-2">
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="h-11 px-6 rounded-xl bg-cayo-tealDark text-white font-black text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
          {onUndo && !editing && (
            <button
              onClick={() => { onUndo(); onClose() }}
              className="w-full h-10 rounded-xl border-2 border-cayo-burgundy/15 text-cayo-burgundy/60 font-bold text-xs hover:border-cayo-burgundy/40 active:scale-[0.98] transition-transform"
            >
              ↶ ביטול סימון
            </button>
          )}
        </div>
      </div>

    </div>
  )
}

export function GuestScrollPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const ITEM_H = 36
  const MIN = 1
  const MAX = 12

  // Scroll to the current value on mount without animation
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = (value - MIN) * ITEM_H
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    if (!listRef.current) return
    const idx = Math.round(listRef.current.scrollTop / ITEM_H)
    const next = Math.min(MAX, Math.max(MIN, idx + MIN))
    if (next !== value) onChange(next)
  }

  function nudge(dir: -1 | 1) {
    const next = Math.min(MAX, Math.max(MIN, value + dir))
    onChange(next)
    if (listRef.current) {
      listRef.current.scrollTo({ top: (next - MIN) * ITEM_H, behavior: 'smooth' })
    }
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {/* Up */}
      <button
        onClick={() => nudge(-1)}
        className="w-6 h-6 flex items-center justify-center text-cayo-burgundy/50 hover:text-cayo-burgundy active:scale-90 transition-all"
        aria-label="פחות"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Drum roll */}
      <div className="relative" style={{ width: 40, height: ITEM_H * 3 }}>
        {/* Highlight the center slot */}
        <div
          className="absolute inset-x-0 pointer-events-none bg-cayo-burgundy/8 rounded-lg"
          style={{ top: ITEM_H, height: ITEM_H }}
        />
        {/* Top + bottom fade */}
        <div
          className="absolute inset-x-0 top-0 pointer-events-none z-10 h-9"
          style={{ background: 'linear-gradient(to bottom, white, transparent)' }}
        />
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none z-10 h-9"
          style={{ background: 'linear-gradient(to top, white, transparent)' }}
        />

        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll"
          style={{
            scrollSnapType: 'y mandatory',
            scrollbarWidth: 'none',
            paddingTop: ITEM_H,
            paddingBottom: ITEM_H,
          }}
        >
          {Array.from({ length: MAX - MIN + 1 }, (_, i) => i + MIN).map(n => (
            <div
              key={n}
              style={{ scrollSnapAlign: 'center', height: ITEM_H }}
              className={`flex items-center justify-center cursor-pointer select-none transition-all duration-150 ${
                value === n
                  ? 'text-cayo-burgundy font-black text-lg'
                  : 'text-cayo-burgundy/25 font-bold text-sm'
              }`}
              onClick={() => {
                onChange(n)
                if (listRef.current) {
                  listRef.current.scrollTo({ top: (n - MIN) * ITEM_H, behavior: 'smooth' })
                }
              }}
            >
              {n}
            </div>
          ))}
        </div>
      </div>

      {/* Down */}
      <button
        onClick={() => nudge(1)}
        className="w-6 h-6 flex items-center justify-center text-cayo-burgundy/50 hover:text-cayo-burgundy active:scale-90 transition-all"
        aria-label="יותר"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

export function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider mb-1">
        {label}
      </p>
      {children}
    </div>
  )
}

