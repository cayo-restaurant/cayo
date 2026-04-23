'use client'

import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import TablePickerModal from '@/app/admin/components/TablePickerModal'
import { classifyTable, TableLiveState, LiveTableStatus } from '@/lib/table-status'
import { computeShiftDateStr } from '@/app/host/shared'
import { useAdminRealtime } from '@/lib/hooks/useAdminRealtime'

// Types -------------------------------------------------------------------

type Shape = 'square' | 'rectangle' | 'bar_stool'
type Area = 'bar' | 'table'

interface RestaurantTable {
  id: string
  table_number: number
  label: string | null
  shape: Shape
  width: number
  height: number
  pos_x: number
  pos_y: number
  capacity_min: number
  capacity_max: number
  area: Area
  rotation: number
  active: boolean
  created_at: string
  updated_at: string
}

const ROTATIONS = [0, 90, 180, 270] as const

type EditableTable = RestaurantTable & { _draft?: boolean; _dirty?: boolean }

// Shapes used by the reassign flow — must match TablePickerModal's
// local ReservationLite and AssignedTable shapes.
interface AssignedTableLite {
  id: string
  tableNumber: number
  label: string | null
  area: Area
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
  tables: AssignedTableLite[]
}

interface Blocker {
  id: string
  name: string
  time: string
  date: string
  status: string
}

interface DeleteFlow {
  tableId: string
  tableNumber: number
  blockers: Blocker[]
}

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין',
  confirmed: 'מאושר',
  arrived: 'הגיע/ה',
  cancelled: 'בוטל',
  no_show: 'לא הגיע',
  completed: 'הסתיים',
}

// Canvas constants --------------------------------------------------------

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 800
const GRID_SNAP = 10
const AUTOSAVE_DEBOUNCE_MS = 250

// Fixed architectural features --------------------------------------------
//
// These are *built-in* parts of the restaurant layout (bar counter, host
// stand, waiter station, column). They don't move and aren't stored in the
// DB — they're purely visual context so the hostess and the owner can tell
// which table is next to what. To move or resize one, edit the numbers
// below; they're in the same 1200×800 logical coordinate system the tables
// use.
interface FixedFeature {
  id: string
  kind: 'bar' | 'host' | 'waiter' | 'column'
  label: string
  pos_x: number
  pos_y: number
  width: number
  height: number
  shape: 'rectangle' | 'square' | 'circle'
}

const FIXED_FEATURES: FixedFeature[] = [
  // Host stand — bottom-right corner, at the entrance.
  { id: 'host',   kind: 'host',   label: 'מארחת', pos_x: 1000, pos_y: 680, width: 100, height: 100, shape: 'rectangle' },
  // Column — small circle, positioned just below table 7.
  { id: 'column', kind: 'column', label: 'עמוד',  pos_x: 425,  pos_y: 455, width: 50,  height: 50,  shape: 'circle' },
  // Bar — long rectangle along the top, from the left corner to a bit past the middle.
  { id: 'bar',    kind: 'bar',    label: 'בר',    pos_x: 20,   pos_y: 40,  width: 820, height: 60,  shape: 'rectangle' },
  // Waiter station — vertical, positioned below the bar on the right side.
  { id: 'waiter', kind: 'waiter', label: 'עמדת מלצרים', pos_x: 970, pos_y: 30,  width: 60,  height: 120, shape: 'rectangle' },
]

const PALETTE: Array<{
  shape: Shape
  label: string
  width: number
  height: number
  capacity_min: number
  capacity_max: number
  area: Area
}> = [
  { shape: 'square',    label: 'ריבוע',    width: 80,  height: 80, capacity_min: 1, capacity_max: 2, area: 'table' },
  { shape: 'rectangle', label: 'מלבן',    width: 140, height: 80, capacity_min: 2, capacity_max: 4, area: 'table' },
  { shape: 'bar_stool', label: 'שרפרף בר', width: 50,  height: 50, capacity_min: 1, capacity_max: 1, area: 'bar'   },
]

function snap(v: number) {
  return Math.round(v / GRID_SNAP) * GRID_SNAP
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
function nextTableNumber(tables: EditableTable[], area: Area): number {
  const base = area === 'bar' ? 101 : 1
  const used = new Set(tables.map((t) => t.table_number))
  let n = base
  while (used.has(n)) n++
  return n
}

function tablePayload(t: EditableTable) {
  return {
    table_number: t.table_number,
    shape: t.shape,
    width: t.width,
    height: t.height,
    pos_x: t.pos_x,
    pos_y: t.pos_y,
    capacity_min: t.capacity_min,
    capacity_max: t.capacity_max,
    area: t.area,
    rotation: t.rotation,
  }
}

// Page --------------------------------------------------------------------

export default function AdminMapPage() {
  const { status } = useSession()
  // A logged-in hostess (host cookie, not an admin Google session) can also
  // view this page. She lands here via /host/map and sees the live map only
  // — no edit controls, no delete, no drag-to-move. Writes are blocked at
  // the API layer regardless; this gate just keeps the UI honest.
  const [isHost, setIsHost] = useState<boolean | null>(null)
  useEffect(() => {
    let mounted = true
    fetch('/api/host/me', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (mounted) setIsHost(Boolean(data?.id)) })
      .catch(() => { if (mounted) setIsHost(false) })
    return () => { mounted = false }
  }, [])
  // True when the viewer is a hostess and NOT also an admin. Used only
  // for cosmetic adjustments (back-link target/label); editing itself is
  // allowed for hostesses too — the API enforces auth on writes.
  const hostOnly = isHost === true && status !== 'authenticated'
  // The map is usable as soon as either identity resolves.
  const isAuthed = status === 'authenticated' || isHost === true

  const [tables, setTables] = useState<EditableTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveInFlight, setSaveInFlight] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteFlow, setDeleteFlow] = useState<DeleteFlow | null>(null)
  const [reassign, setReassign] = useState<{
    reservation: ReservationLite
    all: ReservationLite[]
  } | null>(null)
  // Live mode state — reservations loaded only when !editMode.
  const [liveReservations, setLiveReservations] = useState<ReservationLite[]>([])
  const [livePopoverId, setLivePopoverId] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/map/tables', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          typeof body?.error === 'string' ? body.error : 'שגיאה ' + res.status,
        )
      }
      const data: RestaurantTable[] = await res.json()
      setTables(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthed) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed])

  // Ref to the current live-reservations fetcher so the realtime handler
  // can refresh without re-capturing the closure on every render.
  const liveFetchRef = useRef<(() => Promise<void>) | null>(null)

  // Live mode data: pull reservations, poll every 60 s as a fallback,
  // and tick a 30 s clock so `reserved_soon` expires without a re-fetch.
  useEffect(() => {
    if (!isAuthed) return
    if (editMode) {
      setLiveReservations([])
      setLivePopoverId(null)
      return
    }
    let cancelled = false
    const fetchLive = async () => {
      try {
        const res = await fetch('/api/reservations', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const list: ReservationLite[] = Array.isArray(data?.reservations) ? data.reservations : []
        if (!cancelled) setLiveReservations(list)
      } catch { /* fallback: next tick */ }
    }
    fetchLive()
    const poll = setInterval(fetchLive, 60000)
    const tick = setInterval(() => setNowTick(Date.now()), 30000)
    liveFetchRef.current = fetchLive
    return () => {
      cancelled = true
      clearInterval(poll)
      clearInterval(tick)
      liveFetchRef.current = null
    }
  }, [isAuthed, editMode])

  useAdminRealtime(!editMode && isAuthed, (evt) => {
    if (evt.table === 'restaurant_tables') {
      // Layout changed somewhere else — reload the tables list.
      load()
      return
    }
    // reservations / reservation_tables: refresh the Live view's snapshot.
    liveFetchRef.current?.()
  })

  useEffect(() => {
    if (!editMode) return
    if (saveInFlight) return
    const needsSave = tables.some((t) => t._dirty || t._draft)
    if (!needsSave) return

    const timer = setTimeout(() => {
      flushPendingSaves()
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, editMode, saveInFlight])

  const flushPendingSaves = async () => {
    setSaveInFlight(true)
    setSaveError(null)
    try {
      const snapshot = tables
      for (const t of snapshot) {
        if (t._draft) {
          const res = await fetch('/api/admin/map/tables', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(tablePayload(t)),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(
              'יצירת שולחן ' + t.table_number + ' נכשלה: ' +
              (typeof body?.error === 'string'
                ? body.error
                : JSON.stringify(body?.error ?? res.status)),
            )
          }
          const created: RestaurantTable = await res.json()
          const draftId = t.id
          setTables((prev) => prev.map((x) => (x.id === draftId ? { ...created } : x)))
          setSelectedId((prev) => (prev === draftId ? created.id : prev))
        } else if (t._dirty) {
          const res = await fetch('/api/admin/map/tables/' + t.id, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(tablePayload(t)),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(
              'עדכון שולחן ' + t.table_number + ' נכשל: ' +
              (typeof body?.error === 'string'
                ? body.error
                : JSON.stringify(body?.error ?? res.status)),
            )
          }
          const updated: RestaurantTable = await res.json()
          setTables((prev) => prev.map((x) => (x.id === t.id ? { ...updated } : x)))
        }
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'שמירה נכשלה')
      try { await load() } catch { /* already surfaced */ }
    } finally {
      setSaveInFlight(false)
    }
  }

  // Wait until both identity probes resolve (NextAuth status + /api/host/me)
  // before deciding whether to show the login prompt. Otherwise a hostess
  // with a valid cookie would see a flash of "please log in" while NextAuth
  // is still reporting 'loading'.
  if (status === 'loading' || isHost === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cayo-cream">
        <p className="text-cayo-burgundy font-bold">טוען...</p>
      </div>
    )
  }
  if (!isAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cayo-cream">
        <div className="text-center">
          <p className="text-cayo-burgundy font-bold mb-4">נדרשת התחברות</p>
          <Link href="/admin/login" className="inline-block bg-cayo-burgundy text-white font-bold py-2 px-4 rounded-lg">
            כניסה
          </Link>
        </div>
      </div>
    )
  }

  const selected = tables.find((t) => t.id === selectedId) ?? null
  const pendingCount = tables.filter((t) => t._dirty || t._draft).length

  // Live-mode classification: one TableLiveState per table id.
  // nowTick is included implicitly via the re-render caused by setNowTick.
  const liveByTableId: Map<string, TableLiveState> = (() => {
    const out = new Map<string, TableLiveState>()
    if (editMode) return out
    const now = new Date(nowTick)
    const shiftDate = computeShiftDateStr(now)
    // Narrow the API's status: string into the classifier's enum.
    const forLive = liveReservations.map((r) => ({
      id: r.id,
      name: r.name,
      date: r.date,
      time: r.time,
      status: r.status as 'pending' | 'confirmed' | 'cancelled' | 'arrived' | 'no_show' | 'completed',
      guests: r.guests,
      tables: r.tables.map((t) => ({ id: t.id })),
    }))
    for (const t of tables) {
      out.set(t.id, classifyTable(t.id, forLive, now, shiftDate))
    }
    return out
  })()

  const popoverTable = livePopoverId ? tables.find((t) => t.id === livePopoverId) ?? null : null
  const popoverLive = livePopoverId ? liveByTableId.get(livePopoverId) ?? null : null

  const advanceStatus = async (reservationId: string, nextStatus: 'confirmed' | 'arrived' | 'completed') => {
    // Optimistic merge so the popover reflects the change before the
    // network round-trip returns.
    setLiveReservations((prev) =>
      prev.map((r) => (r.id === reservationId ? { ...r, status: nextStatus } : r)),
    )
    try {
      const res = await fetch('/api/reservations/' + reservationId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body?.error === 'string' ? body.error : 'שגיאה ' + res.status)
      }
      const body = await res.json()
      const fresh = body.reservation
      if (fresh) {
        setLiveReservations((prev) => prev.map((r) => (r.id === fresh.id ? fresh : r)))
      }
    } catch (e) {
      // Rollback by re-fetching the list.
      setSaveError(e instanceof Error ? e.message : 'שגיאה בעדכון סטטוס')
      try {
        const r = await fetch('/api/reservations', { cache: 'no-store' })
        if (r.ok) {
          const data = await r.json()
          setLiveReservations(Array.isArray(data?.reservations) ? data.reservations : [])
        }
      } catch { /* surfaced via saveError */ }
    }
  }

  const handleDropNew = (shape: Shape, x: number, y: number) => {
    const proto = PALETTE.find((p) => p.shape === shape)
    if (!proto) return
    const now = new Date().toISOString()
    const table_number = nextTableNumber(tables, proto.area)
    const newTable: EditableTable = {
      id: 'draft-' + Math.random().toString(36).slice(2, 10),
      table_number,
      label: null,
      shape,
      width: proto.width,
      height: proto.height,
      pos_x: clamp(snap(x - proto.width / 2), 0, CANVAS_WIDTH - proto.width),
      pos_y: clamp(snap(y - proto.height / 2), 0, CANVAS_HEIGHT - proto.height),
      capacity_min: proto.capacity_min,
      capacity_max: proto.capacity_max,
      area: proto.area,
      rotation: 0,
      active: true,
      created_at: now,
      updated_at: now,
      _draft: true,
    }
    setTables((prev) => [...prev, newTable])
    setSelectedId(newTable.id)
  }

  const handleMove = (id: string, x: number, y: number) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              pos_x: clamp(snap(x), 0, CANVAS_WIDTH - t.width),
              pos_y: clamp(snap(y), 0, CANVAS_HEIGHT - t.height),
              _dirty: true,
            }
          : t,
      ),
    )
  }

  const handleUpdate = (id: string, patch: Partial<EditableTable>) => {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, _dirty: true } : t)),
    )
  }

  // Run the server-side pre-flight. Returns the blocker list.
  const preflightDelete = async (id: string): Promise<Blocker[]> => {
    const res = await fetch('/api/admin/map/tables/' + id + '?dryRun=1', { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        typeof body?.error === 'string' ? body.error : 'שגיאה ' + res.status,
      )
    }
    const body = await res.json()
    return Array.isArray(body?.blockers) ? (body.blockers as Blocker[]) : []
  }

  // Actual soft-delete after blockers are cleared.
  const performDelete = async (id: string) => {
    const res = await fetch('/api/admin/map/tables/' + id, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        typeof body?.error === 'string' ? body.error : 'שגיאה ' + res.status,
      )
    }
    setTables((prev) => prev.filter((x) => x.id !== id))
    setSelectedId(null)
  }

  const handleDelete = async (id: string) => {
    const t = tables.find((x) => x.id === id)
    if (!t) return
    if (t._draft) {
      setTables((prev) => prev.filter((x) => x.id !== id))
      setSelectedId(null)
      return
    }

    try {
      const blockers = await preflightDelete(id)
      if (blockers.length === 0) {
        if (!confirm('למחוק את שולחן ' + t.table_number + '?')) return
        await performDelete(id)
        return
      }
      // Blockers present — show inline panel; no mutation yet.
      setDeleteFlow({ tableId: id, tableNumber: t.table_number, blockers })
    } catch (e) {
      setSaveError(
        'מחיקת שולחן נכשלה: ' + (e instanceof Error ? e.message : 'שגיאה'),
      )
    }
  }

  // Open the picker for a specific blocker. We need both the target
  // reservation (with hydrated tables) and the full list so the picker
  // can detect conflicts.
  const openReassign = async (blocker: Blocker) => {
    try {
      const [oneRes, allRes] = await Promise.all([
        fetch('/api/reservations/' + blocker.id, { cache: 'no-store' }),
        fetch('/api/reservations', { cache: 'no-store' }),
      ])
      if (!oneRes.ok) throw new Error('שגיאה בטעינת ההזמנה')
      if (!allRes.ok) throw new Error('שגיאה בטעינת רשימת ההזמנות')
      const oneBody = await oneRes.json()
      const allBody = await allRes.json()
      const reservation: ReservationLite = oneBody.reservation
      const all: ReservationLite[] = Array.isArray(allBody?.reservations) ? allBody.reservations : []
      setReassign({ reservation, all })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'שגיאה בפתיחת שיוך מחדש')
    }
  }

  // After a reassign save, re-run the pre-flight for the table we
  // were trying to delete. If the blocker list is now empty, the
  // hostess can finalize the delete.
  const onReassignSaved = async () => {
    setReassign(null)
    if (!deleteFlow) return
    try {
      const blockers = await preflightDelete(deleteFlow.tableId)
      setDeleteFlow({ ...deleteFlow, blockers })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'שגיאה ברענון חוסמים')
    }
  }

  const finalizeBlockedDelete = async () => {
    if (!deleteFlow) return
    if (deleteFlow.blockers.length > 0) return
    try {
      await performDelete(deleteFlow.tableId)
      setDeleteFlow(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'שגיאה במחיקה')
    }
  }

  const handleExitEdit = () => {
    setEditMode(false)
    setSelectedId(null)
  }

  return (
    <div className="min-h-screen bg-cayo-cream">
      <div className="bg-cayo-burgundy text-white">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={hostOnly ? '/host' : '/admin'}
              className="bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-3 py-1.5 text-sm font-bold"
            >
              {hostOnly ? 'חזרה למצב מארחת' : 'חזרה'}
            </Link>
            <h1 className="text-xl sm:text-2xl font-black">מפת המסעדה</h1>
            {!loading && (
              <span className="text-xs text-white/60 hidden sm:inline">
                · {tables.length} שולחנות
              </span>
            )}
            {editMode && (
              <SaveIndicator saveInFlight={saveInFlight} pendingCount={pendingCount} />
            )}
          </div>

          <div className="flex items-center gap-2">
            {editMode ? (
              <button
                type="button"
                onClick={handleExitEdit}
                className="bg-white text-cayo-burgundy rounded-lg px-3 py-1.5 text-sm font-bold hover:bg-cayo-cream transition-colors"
              >
                סיום עריכה
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setEditMode(true); setSelectedId(null); setSaveError(null) }}
                className="bg-white/10 hover:bg-white/20 text-white transition-colors rounded-lg px-3 py-1.5 text-sm font-bold"
              >
                עריכת מפה
              </button>
            )}
          </div>
        </div>
      </div>

      {saveError && (
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-cayo-red/10 border-2 border-cayo-red/40 text-cayo-red rounded-lg px-4 py-3 text-sm font-bold flex items-center justify-between gap-3">
            <span>{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="text-cayo-red/70 hover:text-cayo-red text-xs font-bold underline"
            >
              סגור
            </button>
          </div>
        </div>
      )}

      {deleteFlow && (
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-black text-amber-900">
                הזמנות חוסמות את המחיקה של שולחן {deleteFlow.tableNumber}
              </h3>
              <button
                type="button"
                onClick={() => setDeleteFlow(null)}
                className="text-amber-900/70 hover:text-amber-900 text-xs font-bold underline"
              >
                סגור
              </button>
            </div>

            {deleteFlow.blockers.length === 0 ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-amber-900">אין עוד הזמנות חוסמות.</p>
                <button
                  type="button"
                  onClick={finalizeBlockedDelete}
                  className="bg-cayo-red text-white font-black text-sm rounded-lg px-4 py-2.5 min-h-[44px]"
                >
                  מחק שולחן
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {deleteFlow.blockers.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 bg-white border border-amber-300 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black text-cayo-burgundy truncate">
                        {b.name || 'ללא שם'}
                      </p>
                      <p className="text-xs text-cayo-burgundy/70">
                        {b.date} · {b.time} · {STATUS_HE[b.status] ?? b.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openReassign(b)}
                      className="bg-cayo-burgundy text-white font-bold text-sm rounded-lg px-3 py-2 min-h-[44px] shrink-0"
                    >
                      שייך מחדש
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6">
        <div className={editMode ? 'grid grid-cols-1 lg:grid-cols-[180px_1fr_240px] gap-4' : ''}>
          {editMode && <Palette onDragStart={() => setSelectedId(null)} />}

          <div className="overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 touch-pan-x">
            <MapCanvas
              tables={tables}
              loading={loading}
              error={error}
              editMode={editMode}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDropNew={handleDropNew}
              onMove={handleMove}
              liveByTableId={liveByTableId}
              onLiveClick={(id) => setLivePopoverId(id)}
            />
          </div>

          {editMode && (
            <EditPanel
              table={selected}
              tables={tables}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
        </div>


        {editMode && (
          <p className="mt-4 text-center text-xs text-cayo-burgundy/50">
            גרור צורה מהפאלטה · לחץ על שולחן לבחור · גרור שולחן להזזה · שינויים נשמרים אוטומטית
          </p>
        )}
      </div>

      {reassign && (
        <TablePickerModal
          open={true}
          onClose={() => setReassign(null)}
          reservation={reassign.reservation}
          allReservations={reassign.all}
          onSaved={onReassignSaved}
        />
      )}

      {popoverTable && popoverLive && (
        <LivePopover
          tableNumber={popoverTable.table_number}
          live={popoverLive}
          onAdvance={advanceStatus}
          onClose={() => setLivePopoverId(null)}
        />
      )}
    </div>
  )
}

function LivePopover({
  tableNumber,
  live,
  onAdvance,
  onClose,
}: {
  tableNumber: number
  live: TableLiveState
  onAdvance: (id: string, status: 'confirmed' | 'arrived' | 'completed') => void
  onClose: () => void
}) {
  const dotColor =
    live.status === 'occupied' ? 'bg-rose-500'
    : live.status === 'reserved_soon' ? 'bg-amber-400'
    : 'bg-emerald-500'
  const statusHe: Record<string, string> = {
    pending: 'ממתין', confirmed: 'מאושר', arrived: 'הגיע/ה',
    cancelled: 'בוטל', no_show: 'לא הגיע', completed: 'הסתיים',
  }
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-cayo-burgundy/10">
          <div className="flex items-center gap-2">
            <span className={'inline-block w-3 h-3 rounded-full ' + dotColor} aria-hidden="true" />
            <h2 className="text-lg font-black text-cayo-burgundy">
              שולחן {tableNumber}
            </h2>
            <span className="text-sm text-cayo-burgundy/70">· {LIVE_LABEL[live.status]}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none min-h-[44px] min-w-[44px]"
            aria-label="סגור"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {live.rows.length === 0 && (
            <p className="text-sm text-cayo-burgundy/60 text-center py-6">
              אין הזמנות על השולחן הזה הערב.
            </p>
          )}
          {live.rows.map((r) => (
            <div
              key={r.reservationId}
              className="bg-cayo-cream border border-cayo-burgundy/10 rounded-xl px-3 py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-black text-cayo-burgundy truncate">
                  {r.name || 'ללא שם'}
                </p>
                <p className="text-xs text-cayo-burgundy/70">
                  {r.guests} סועד/ים · {r.time} · {statusHe[r.status] ?? r.status}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {r.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => onAdvance(r.reservationId, 'confirmed')}
                    className="bg-cayo-teal text-white font-bold text-xs rounded-lg px-3 min-h-[44px]"
                  >
                    אשר
                  </button>
                )}
                {(r.status === 'pending' || r.status === 'confirmed') && (
                  <button
                    type="button"
                    onClick={() => onAdvance(r.reservationId, 'arrived')}
                    className="bg-cayo-burgundy text-white font-bold text-xs rounded-lg px-3 min-h-[44px]"
                  >
                    סמן הגיעו
                  </button>
                )}
                {r.status === 'arrived' && (
                  <button
                    type="button"
                    onClick={() => onAdvance(r.reservationId, 'completed')}
                    className="bg-emerald-600 text-white font-bold text-xs rounded-lg px-3 min-h-[44px]"
                    title="פנה את השולחן והחזר אותו לסטטוס פנוי"
                  >
                    פינו את השולחן
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Save indicator ----------------------------------------------------------

function SaveIndicator({
  saveInFlight,
  pendingCount,
}: {
  saveInFlight: boolean
  pendingCount: number
}) {
  if (saveInFlight) {
    return (
      <span className="text-xs bg-cayo-orange/90 text-white px-2 py-0.5 rounded-full font-bold">
        שומר...
      </span>
    )
  }
  if (pendingCount > 0) {
    return (
      <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">
        {pendingCount} שינויים בהמתנה
      </span>
    )
  }
  return null
}

// Palette -----------------------------------------------------------------

function Palette({ onDragStart }: { onDragStart: () => void }) {
  return (
    <aside className="bg-white border-2 border-cayo-burgundy/15 rounded-2xl p-3 h-fit">
      <h3 className="text-xs font-black text-cayo-burgundy/60 uppercase tracking-wider mb-3">פאלטה</h3>
      <div className="flex flex-col gap-3">
        {PALETTE.map((item) => (
          <div
            key={item.shape}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/cayo-shape', item.shape)
              e.dataTransfer.effectAllowed = 'copy'
              onDragStart()
            }}
            className="cursor-grab active:cursor-grabbing bg-cayo-teal/10 hover:bg-cayo-teal/20 border-2 border-cayo-teal/40 rounded-lg p-3 flex flex-col items-center gap-2 transition-colors"
            title={'גרור: ' + item.label}
          >
            <ShapePreview shape={item.shape} />
            <span className="text-xs font-bold text-cayo-burgundy">{item.label}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function ShapePreview({ shape }: { shape: Shape }) {
  if (shape === 'square') {
    return <div className="w-10 h-10 bg-cayo-teal/30 border-2 border-cayo-teal/60 rounded" />
  }
  if (shape === 'rectangle') {
    return <div className="w-14 h-8 bg-cayo-teal/30 border-2 border-cayo-teal/60 rounded" />
  }
  return <div className="w-8 h-8 bg-cayo-teal/30 border-2 border-cayo-teal/60 rounded-full" />
}

// Fixed feature ------------------------------------------------------------

function FixedFeatureShape({ feature }: { feature: FixedFeature }) {
  const style: CSSProperties = {
    position: 'absolute',
    left: (feature.pos_x / CANVAS_WIDTH) * 100 + '%',
    top: (feature.pos_y / CANVAS_HEIGHT) * 100 + '%',
    width: (feature.width / CANVAS_WIDTH) * 100 + '%',
    height: (feature.height / CANVAS_HEIGHT) * 100 + '%',
    pointerEvents: 'none', // decoration only — can't be selected, dragged, etc.
    zIndex: 0,             // always behind tables
  }
  const radius =
    feature.shape === 'circle' ? 'rounded-full'
    : feature.shape === 'square' ? 'rounded'
    : 'rounded-md'
  return (
    <div
      style={style}
      className={
        'bg-cayo-burgundy/10 border-2 border-cayo-burgundy/30 text-cayo-burgundy/70 ' +
        radius +
        ' flex items-center justify-center font-bold select-none overflow-hidden'
      }
    >
      <span className="text-xs sm:text-sm px-1 text-center leading-tight break-words">{feature.label}</span>
    </div>
  )
}

// Canvas ------------------------------------------------------------------

interface CanvasProps {
  tables: EditableTable[]
  loading: boolean
  error: string | null
  editMode: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDropNew: (shape: Shape, x: number, y: number) => void
  onMove: (id: string, x: number, y: number) => void
  liveByTableId: Map<string, TableLiveState>
  onLiveClick: (id: string) => void
}

function MapCanvas({
  tables, loading, error, editMode, selectedId, onSelect, onDropNew, onMove,
  liveByTableId, onLiveClick,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null)

  const handleStartDrag = (id: string, clientX: number, clientY: number) => {
    const t = tables.find((t) => t.id === id)
    if (!t) return
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      posX: t.pos_x,
      posY: t.pos_y,
    }
    setDraggingId(id)
  }

  useEffect(() => {
    if (!draggingId) return
    const handleMove = (e: PointerEvent) => {
      const d = dragStartRef.current
      if (!d || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const scaleX = CANVAS_WIDTH / rect.width
      const scaleY = CANVAS_HEIGHT / rect.height
      const deltaX = (e.clientX - d.mouseX) * scaleX
      const deltaY = (e.clientY - d.mouseY) * scaleY
      onMove(draggingId, d.posX + deltaX, d.posY + deltaY)
    }
    const handleUp = () => {
      setDraggingId(null)
      dragStartRef.current = null
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [draggingId, onMove])

  const toLogical = (clientX: number, clientY: number) => {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const scaleX = CANVAS_WIDTH / rect.width
    const scaleY = CANVAS_HEIGHT / rect.height
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!editMode) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!editMode) return
    e.preventDefault()
    const shape = e.dataTransfer.getData('text/cayo-shape') as Shape | ''
    if (shape === 'square' || shape === 'rectangle' || shape === 'bar_stool') {
      const { x, y } = toLogical(e.clientX, e.clientY)
      onDropNew(shape, x, y)
    }
  }

  const handleCanvasClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!editMode) return
    if (e.target === canvasRef.current || (e.target as HTMLElement).dataset.canvas === '1') {
      onSelect(null)
    }
  }

  return (
    <div
      ref={canvasRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleCanvasClick}
      data-canvas="1"
      className={
        'relative bg-white border-2 rounded-2xl mx-auto overflow-hidden min-w-[640px] sm:min-w-0 '
        + (editMode
          ? 'border-cayo-orange/40 border-dashed'
          : 'border-cayo-burgundy/25 border-dashed')
      }
      style={{
        width: '100%',
        maxHeight: 'calc(100vh - 180px)',
        aspectRatio: CANVAS_WIDTH + ' / ' + CANVAS_HEIGHT,
      }}
    >
      {/* Fixed features — always rendered, behind tables */}
      <div className="absolute inset-0" data-canvas="1">
        {FIXED_FEATURES.map((f) => (
          <FixedFeatureShape key={f.id} feature={f} />
        ))}
      </div>

      {/* Tables */}
      <div className="absolute inset-0" data-canvas="1">
        {tables.map((t) => (
          <TableShape
            key={t.id}
            table={t}
            selected={t.id === selectedId}
            editMode={editMode}
            isDragging={t.id === draggingId}
            onStartDrag={handleStartDrag}
            onSelect={onSelect}
            live={editMode ? null : liveByTableId.get(t.id) ?? null}
            onLiveClick={onLiveClick}
          />
        ))}
      </div>

      {(loading || error || (!loading && tables.length === 0 && !editMode)) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
          {loading && <p className="text-cayo-burgundy/70 font-bold">טוען שולחנות...</p>}
          {!loading && error && (
            <div>
              <h2 className="text-lg font-black text-cayo-red mb-1">שגיאה בטעינת המפה</h2>
              <p className="text-cayo-burgundy/70 text-sm max-w-md">{error}</p>
              <p className="text-xs text-cayo-burgundy/50 mt-2">
                אם עוד לא הרצת את ה-migration ב-Supabase — זה הזמן.
              </p>
            </div>
          )}
          {!loading && !error && tables.length === 0 && (
            <div>
              <h2 className="text-2xl font-black text-cayo-burgundy mb-2">אין עדיין שולחנות</h2>
              <p className="text-cayo-burgundy/70 max-w-md mb-1">
                לחץ על "עריכת מפה" למעלה כדי להתחיל לגרור שולחנות.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Single table ------------------------------------------------------------

const LIVE_COLOR: Record<LiveTableStatus, string> = {
  occupied: 'bg-rose-500/80 border-rose-700 text-white',
  reserved_soon: 'bg-amber-400/80 border-amber-600 text-cayo-burgundy',
  free: 'bg-emerald-400/70 border-emerald-600 text-cayo-burgundy',
}
const LIVE_LABEL: Record<LiveTableStatus, string> = {
  occupied: 'תפוס',
  reserved_soon: 'מוזמן בקרוב',
  free: 'פנוי',
}

function TableShape({
  table,
  selected,
  editMode,
  isDragging,
  onStartDrag,
  onSelect,
  live,
  onLiveClick,
}: {
  table: EditableTable
  selected: boolean
  editMode: boolean
  isDragging: boolean
  onStartDrag: (id: string, clientX: number, clientY: number) => void
  onSelect: (id: string | null) => void
  live: TableLiveState | null
  onLiveClick: (id: string) => void
}) {
  const isBarStool = table.shape === 'bar_stool'

  const style: CSSProperties = {
    position: 'absolute',
    left: (table.pos_x / CANVAS_WIDTH) * 100 + '%',
    top: (table.pos_y / CANVAS_HEIGHT) * 100 + '%',
    width: (table.width / CANVAS_WIDTH) * 100 + '%',
    height: (table.height / CANVAS_HEIGHT) * 100 + '%',
    transform: table.rotation ? 'rotate(' + table.rotation + 'deg)' : undefined,
    transformOrigin: 'center',
    touchAction: 'none',
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.85 : 1,
  }

  const editColor = table._draft
    ? 'bg-cayo-orange/25 border-cayo-orange text-cayo-burgundy'
    : table._dirty
      ? 'bg-cayo-teal/30 border-cayo-teal text-cayo-burgundy'
      : 'bg-cayo-teal/15 border-cayo-teal/50 text-cayo-burgundy'
  const colorClasses = !editMode && live ? LIVE_COLOR[live.status] : editColor
  const selectedClasses = selected ? 'ring-4 ring-cayo-burgundy/60' : ''
  const radiusClass = isBarStool ? 'rounded-full' : 'rounded-md'
  const cursorClass = editMode ? 'cursor-move' : (live ? 'cursor-pointer' : '')

  const liveAriaLabel = !editMode && live
    ? 'שולחן ' + table.table_number + ' — ' + LIVE_LABEL[live.status]
    : undefined

  return (
    <div
      style={style}
      role={!editMode && live ? 'button' : undefined}
      aria-label={liveAriaLabel}
      onPointerDown={(e) => {
        if (!editMode || e.button !== 0) return
        e.stopPropagation()
        onStartDrag(table.id, e.clientX, e.clientY)
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (editMode) { onSelect(table.id); return }
        if (live) onLiveClick(table.id)
      }}
      className={
        colorClasses + ' ' + radiusClass + ' ' + selectedClasses + ' ' + cursorClass +
        ' border-2 flex items-center justify-center font-black select-none transition-shadow relative'
      }
      title={'שולחן ' + table.table_number + ' · ' + table.capacity_min + '-' + table.capacity_max + ' סועדים'}
    >
      <span className="text-xs sm:text-sm md:text-base">{table.table_number}</span>
      {!editMode && live && live.next && (
        <span
          className="absolute -bottom-1 -left-1 bg-white text-cayo-burgundy text-[10px] font-black rounded px-1 py-0.5 border border-cayo-burgundy/20 leading-none"
          aria-hidden="true"
        >
          {live.next.initials} · {live.next.time}
        </span>
      )}
    </div>
  )
}

// Edit panel --------------------------------------------------------------

function EditPanel({
  table,
  tables,
  onUpdate,
  onDelete,
}: {
  table: EditableTable | null
  tables: EditableTable[]
  onUpdate: (id: string, patch: Partial<EditableTable>) => void
  onDelete: (id: string) => void
}) {
  if (!table) {
    return (
      <aside className="bg-white border-2 border-cayo-burgundy/15 rounded-2xl p-4 h-fit">
        <h3 className="text-xs font-black text-cayo-burgundy/60 uppercase tracking-wider mb-2">עריכה</h3>
        <p className="text-sm text-cayo-burgundy/60">
          בחר שולחן או גרור שולחן חדש מהפאלטה.
        </p>
      </aside>
    )
  }

  const numberConflicts = tables.some(
    (t) => t.id !== table.id && t.table_number === table.table_number,
  )

  return (
    <aside className="bg-white border-2 border-cayo-burgundy/15 rounded-2xl p-4 h-fit">
      <h3 className="text-xs font-black text-cayo-burgundy/60 uppercase tracking-wider mb-3">
        עריכת שולחן
      </h3>

      <label className="block mb-3">
        <span className="text-xs font-bold text-cayo-burgundy/80 block mb-1">מספר שולחן</span>
        <input
          type="number"
          min={1}
          value={table.table_number}
          onChange={(e) => onUpdate(table.id, { table_number: Number(e.target.value) || 0 })}
          className={
            'w-full border-2 rounded-lg px-2 py-1.5 text-sm font-bold text-cayo-burgundy '
            + (numberConflicts ? 'border-cayo-red bg-cayo-red/5' : 'border-cayo-burgundy/15')
          }
        />
        {numberConflicts && <p className="text-xs text-cayo-red mt-1">המספר הזה כבר בשימוש</p>}
      </label>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block">
          <span className="text-xs font-bold text-cayo-burgundy/80 block mb-1">מינ׳ סועדים</span>
          <input
            type="number"
            min={1}
            max={20}
            value={table.capacity_min}
            onChange={(e) => onUpdate(table.id, { capacity_min: Number(e.target.value) || 1 })}
            className="w-full border-2 border-cayo-burgundy/15 rounded-lg px-2 py-1.5 text-sm font-bold text-cayo-burgundy"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-cayo-burgundy/80 block mb-1">מקס׳ סועדים</span>
          <input
            type="number"
            min={1}
            max={20}
            value={table.capacity_max}
            onChange={(e) => onUpdate(table.id, { capacity_max: Number(e.target.value) || 1 })}
            className="w-full border-2 border-cayo-burgundy/15 rounded-lg px-2 py-1.5 text-sm font-bold text-cayo-burgundy"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block">
          <span className="text-xs font-bold text-cayo-burgundy/80 block mb-1">רוחב (px)</span>
          <input
            type="number"
            min={20}
            max={500}
            step={10}
            value={table.width}
            onChange={(e) => onUpdate(table.id, { width: Number(e.target.value) || 20 })}
            className="w-full border-2 border-cayo-burgundy/15 rounded-lg px-2 py-1.5 text-sm font-bold text-cayo-burgundy"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-cayo-burgundy/80 block mb-1">גובה (px)</span>
          <input
            type="number"
            min={20}
            max={500}
            step={10}
            value={table.height}
            onChange={(e) => onUpdate(table.id, { height: Number(e.target.value) || 20 })}
            className="w-full border-2 border-cayo-burgundy/15 rounded-lg px-2 py-1.5 text-sm font-bold text-cayo-burgundy"
          />
        </label>
      </div>

      <label className="block mb-3">
        <span className="text-xs font-bold text-cayo-burgundy/80 block mb-1">אזור</span>
        <select
          value={table.area}
          onChange={(e) => onUpdate(table.id, { area: e.target.value as Area })}
          className="w-full border-2 border-cayo-burgundy/15 rounded-lg px-2 py-1.5 text-sm font-bold text-cayo-burgundy"
        >
          <option value="table">שולחן (פלור)</option>
          <option value="bar">בר</option>
        </select>
      </label>

      <div className="mb-4">
        <span className="text-xs font-bold text-cayo-burgundy/80 block mb-1">
          סיבוב ({table.rotation}°)
        </span>
        <div className="flex gap-1">
          {ROTATIONS.map((deg) => (
            <button
              key={deg}
              type="button"
              onClick={() => onUpdate(table.id, { rotation: deg })}
              className={
                'flex-1 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors '
                + (table.rotation === deg
                  ? 'bg-cayo-burgundy text-white border-cayo-burgundy'
                  : 'bg-white text-cayo-burgundy border-cayo-burgundy/15 hover:bg-cayo-burgundy/5')
              }
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(table.id)}
        className="w-full bg-cayo-red/10 hover:bg-cayo-red/20 text-cayo-red border-2 border-cayo-red/30 rounded-lg py-2 text-sm font-bold transition-colors"
      >
        מחק שולחן
      </button>
    </aside>
  )
}
