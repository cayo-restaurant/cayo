'use client'

// Table picker — single OR combined tables.
//
// Multi-select by checkbox. The order the hostess taps rows in is
// preserved: the FIRST selected table becomes the "primary" (the one
// that shows on the reservation card as `שולחן N +extras`). We keep
// selection state as an ordered array rather than a Set so that
// information doesn't get lost on re-renders.
//
// The API endpoint at /api/reservations/[id]/tables has always
// accepted `{ tableIds, primaryTableId }` — the single-select UX we
// shipped in Phase 1 just never exercised that shape. This picker
// now does.
import { useEffect, useMemo, useState } from 'react'
import { useAdminRealtime } from '@/lib/hooks/useAdminRealtime'

interface TableLite {
  id: string
  table_number: number
  label: string | null
  area: 'bar' | 'table'
  capacity_min: number
  capacity_max: number
}

interface AssignedTable {
  id: string
  tableNumber: number
  label: string | null
  area: 'bar' | 'table'
  capacityMin: number
  capacityMax: number
  isPrimary: boolean
}

interface ReservationLite {
  id: string
  name: string
  time: string
  date: string
  status: string
  guests: number
  tables: AssignedTable[]
}

interface Props {
  open: boolean
  onClose: () => void
  reservation: ReservationLite
  // Pass the currently loaded list so we can hint the hostess which
  // tables are already held by another guest in the same window.
  allReservations: ReservationLite[]
  // Called with the new assignment list on successful save. The parent
  // is responsible for replacing its local state — we don't re-fetch.
  onSaved: (tables: AssignedTable[]) => void
}

// A reservation's "window" is [time, time + 120min). Two reservations
// overlap if their windows intersect. Cheap client-side check.
const DURATION_MIN = 120

function minutesFromTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function windowsOverlap(aTime: string, bTime: string): boolean {
  const a = minutesFromTime(aTime)
  const b = minutesFromTime(bTime)
  return Math.abs(a - b) < DURATION_MIN
}

const OCCUPYING = new Set(['pending', 'confirmed', 'arrived'])

interface ConflictInfo {
  reservationId: string
  name: string
  time: string
}

// Build the initial selection array from a reservation's current tables.
// Primary goes first (so re-opening an existing assignment keeps its
// "primary" flag), then the rest in server order.
function seedSelection(tables: AssignedTable[]): string[] {
  const primary = tables.find(t => t.isPrimary)
  if (!primary) return tables.map(t => t.id)
  const rest = tables.filter(t => !t.isPrimary).map(t => t.id)
  return [primary.id, ...rest]
}

function findConflict(
  tableId: string,
  target: ReservationLite,
  all: ReservationLite[]
): ConflictInfo | null {
  for (const r of all) {
    if (r.id === target.id) continue
    if (r.date !== target.date) continue
    if (!OCCUPYING.has(r.status)) continue
    if (!r.tables.some(t => t.id === tableId)) continue
    if (!windowsOverlap(r.time, target.time)) continue
    return { reservationId: r.id, name: r.name || 'ללא שם', time: r.time }
  }
  return null
}

export default function TablePickerModal({
  open,
  onClose,
  reservation,
  allReservations,
  onSaved,
}: Props) {
  const [tables, setTables] = useState<TableLite[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [externalToast, setExternalToast] = useState<string>('')
  // Ordered list — index 0 is the primary (the one that shows on the
  // reservation card). We build the initial list by putting the current
  // primary first, then the rest in whatever order the server returned.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => seedSelection(reservation.tables))
  // Default view hides tables too small for the party, so the hostess sees
  // only fitting options without scanning the full map. The toggle chip
  // below flips this off when she wants to combine small tables manually.
  // Auto-opens if filtering would leave her with zero options.
  const [showSmall, setShowSmall] = useState(false)

  // Re-seed selection when reservation changes (e.g. modal re-opened for another row)
  useEffect(() => {
    if (open) {
      setSelectedIds(seedSelection(reservation.tables))
      setShowSmall(false)
      setError('')
    }
  }, [open, reservation.id, reservation.tables])

  // Load active tables when the modal opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch('/api/admin/map/tables', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: TableLite[]) => {
        if (!cancelled) setTables(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setError('שגיאה בטעינת רשימת השולחנות')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Cross-device change handling: if another admin edits reservations or
  // the tables layout while this modal is open, refresh the tables list
  // and show a brief toast. The parent already feeds fresh allReservations
  // via its own realtime hook, so conflicts in the rows update on their
  // own render.
  useAdminRealtime(open, (evt) => {
    if (evt.table === 'restaurant_tables' || evt.table === 'reservation_tables' || evt.table === 'reservations') {
      setExternalToast('ההזמנות עודכנו — מרענן זמינות')
      fetch('/api/admin/map/tables', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : Promise.reject(r)))
        .then((data: TableLite[]) => setTables(Array.isArray(data) ? data : []))
        .catch(() => { /* surfaced via existing error */ })
      // Auto-dismiss the toast after a couple of seconds.
      setTimeout(() => setExternalToast(''), 2500)
    }
  })

  if (!open) return null

  async function save(tableIds: string[], primaryTableId: string | null) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableIds, primaryTableId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'שגיאה בשמירה')
        return
      }
      const data = await res.json()
      onSaved(data.tables || [])
      onClose()
    } catch {
      setError('שגיאה בחיבור')
    } finally {
      setSaving(false)
    }
  }

  function toggleTable(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }

  const handleSave = () => {
    if (selectedIds.length > 0) {
      // First-selected is primary. This matches the hostess's mental
      // model: whichever she tapped first is "the main table" she's
      // seating the party at; anything added after is filler.
      save(selectedIds, selectedIds[0])
    } else {
      save([], null)
    }
  }

  const handleClear = () => {
    save([], null)
  }

  // Capacity summary for the combo — sum of min and max across selected.
  // Only surfaced when 2+ are selected (a single table already shows its
  // own capacity in the row).
  const capacityTotals = useMemo(() => {
    if (selectedIds.length < 2) return null
    const byId = new Map(tables.map(t => [t.id, t]))
    let min = 0
    let max = 0
    for (const id of selectedIds) {
      const t = byId.get(id)
      if (!t) continue
      min += t.capacity_min
      max += t.capacity_max
    }
    return { min, max }
  }, [selectedIds, tables])

  // Fitting tables are those whose own capacity_max already covers the
  // party. We always keep currently-selected tables visible even if they
  // don't fit (so the hostess can see what she's about to deselect).
  const fits = (t: TableLite) =>
    t.capacity_max >= reservation.guests || selectedIds.includes(t.id)
  const hiddenCount = tables.filter(t => !fits(t)).length
  const visibleTables = showSmall ? tables : tables.filter(fits)
  // If the default filter leaves nothing, expand automatically — never
  // show an empty picker to the hostess.
  useEffect(() => {
    if (
      !showSmall &&
      !loading &&
      tables.length > 0 &&
      visibleTables.length === 0
    ) {
      setShowSmall(true)
    }
  }, [showSmall, loading, tables.length, visibleTables.length])
  const barTables = visibleTables.filter(t => t.area === 'bar')
  const areaTables = visibleTables.filter(t => t.area === 'table')
  const primaryId = selectedIds[0] ?? null
  const showPrimaryBadge = selectedIds.length >= 2 // no point showing "primary" when there's only one
  const renderRow = (t: TableLite) => {
    const conflict = findConflict(t.id, reservation, allReservations)
    const isSelected = selectedIds.includes(t.id)
    const isPrimary = showPrimaryBadge && primaryId === t.id
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => toggleTable(t.id)}
        className={`w-full text-right p-3 rounded-xl border-2 transition-colors ${
          isSelected
            ? 'border-cayo-burgundy bg-cayo-burgundy/10'
            : 'border-cayo-burgundy/15 hover:border-cayo-burgundy/40 bg-white'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-black text-cayo-burgundy flex items-center gap-2 flex-wrap">
              <span>
                שולחן {t.table_number}
                {t.label ? <span className="font-normal text-sm text-gray-500 mr-2">· {t.label}</span> : null}
              </span>
              {isPrimary && (
                <span className="text-[10px] font-black uppercase tracking-wider bg-cayo-burgundy text-white px-1.5 py-0.5 rounded">
                  ראשי
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              קיבולת {t.capacity_min === t.capacity_max ? t.capacity_max : `${t.capacity_min}–${t.capacity_max}`}
            </p>
            {conflict && (
              <p className="text-[11px] font-bold text-amber-700 mt-1">
                ⚠ תפוס — {conflict.name} · {conflict.time}
              </p>
            )}
          </div>
          <div
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${
              isSelected ? 'border-cayo-burgundy bg-cayo-burgundy text-white' : 'border-gray-300'
            }`}
          >
            {isSelected && <span className="text-xs font-black">✓</span>}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-cayo-burgundy/10">
          <div>
            <h2 className="text-lg font-black text-cayo-burgundy">שיוך שולחן</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {reservation.name} · {reservation.time} · {reservation.date} · {reservation.guests} סועדים
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <p className="text-center text-gray-500 text-sm py-6">טוען שולחנות…</p>
          )}
          {!loading && tables.length === 0 && !error && (
            <p className="text-center text-gray-500 text-sm py-6">אין שולחנות פעילים.</p>
          )}
          {!loading && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSmall(s => !s)}
              className={`w-full text-xs font-bold rounded-xl py-2 px-3 border-2 transition-colors ${
                showSmall
                  ? 'border-cayo-burgundy/40 bg-cayo-burgundy/5 text-cayo-burgundy'
                  : 'border-cayo-burgundy/15 bg-white text-cayo-burgundy/70 hover:border-cayo-burgundy/30'
              }`}
            >
              {showSmall
                ? `מציגה הכל · הסתירי שולחנות מתחת ל-${reservation.guests}`
                : `הצגת שולחנות המתאימים ל-${reservation.guests} סועדים · הציגי גם קטנים (${hiddenCount})`}
            </button>
          )}
          {!loading && areaTables.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-cayo-burgundy/70 uppercase tracking-wide mb-2">
                שולחנות ({areaTables.length})
              </h3>
              <div className="space-y-2">{areaTables.map(renderRow)}</div>
            </div>
          )}
          {!loading && barTables.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-cayo-burgundy/70 uppercase tracking-wide mb-2">
                בר ({barTables.length})
              </h3>
              <div className="space-y-2">{barTables.map(renderRow)}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-cayo-burgundy/10 space-y-2">
          {externalToast && (
            <p className="text-xs font-bold text-center bg-cayo-orange/15 text-cayo-orange rounded-lg py-1.5">
              {externalToast}
            </p>
          )}
          {capacityTotals && (
            <p className="text-xs font-bold text-cayo-burgundy/80 text-center bg-cayo-burgundy/5 rounded-lg py-1.5">
              קיבולת שילוב {capacityTotals.min === capacityTotals.max
                ? capacityTotals.max
                : `${capacityTotals.min}–${capacityTotals.max}`}
              {' '}סועדים · {selectedIds.length} שולחנות
            </p>
          )}
          {error && (
            <p className="text-sm text-cayo-red font-bold text-center">{error}</p>
          )}
          <div className="flex gap-2">
            {reservation.tables.length > 0 && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border-2 border-cayo-red/30 text-cayo-red font-bold text-sm hover:bg-cayo-red/5 disabled:opacity-50"
              >
                הסר שיוך
              </button>
            )}
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-cayo-burgundy/20 text-cayo-burgundy font-bold text-sm hover:bg-cayo-burgundy/5 disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (selectedIds.length === 0 && reservation.tables.length === 0)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-cayo-burgundy text-white font-black text-sm hover:bg-cayo-burgundy/90 disabled:opacity-50"
            >
              {saving ? 'שומר…' : 'שמור'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
