'use client'

// Hostess shift-mode dashboard.
//
// Scope intentionally narrow: view only today's reservations, with fast
// one-tap actions for the two things the hostess does during service —
// marking arrival and marking no-show — plus a prominent late indicator with
// a direct call button once a confirmed reservation is 15+ minutes past its
// slot without being marked arrived.
//
// This page is NOT for the owner/manager. Admin features (customer history,
// month stats, pending approvals, create/edit/delete) live at /admin.
//
// Reservations that have already been marked (arrived / no_show) are moved
// OUT of this page entirely and live at /host/marked, accessible via the
// button in the header. That keeps the working queue focused — the hostess
// only sees what she still has to act on.
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import cayoLogo from '../../cayo_brand_page_005.png'
import {
  AssignedTable,
  Enriched,
  HEBREW_DAYS,
  HEBREW_MONTHS,
  Reservation,
  ReservationRow,
  Status,
  TableLite,
  computeShiftDateStr,
  enrich,
  shiftAdjustedDate,
} from './shared'
import { UndoToast, UndoToastState } from '../../components/UndoToast'
import TablePickerModal from '../admin/components/TablePickerModal'

export default function HostDashboard() {
  const router = useRouter()
  const [items, setItems] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // aria-live message announced to screen readers on any status flip.
  // Mirrors what the sighted hostess sees in the optimistic list update.
  const [announce, setAnnounce] = useState('')
  // `now` ticks every 30s so late minutes update without a manual reload
  const [now, setNow] = useState<number>(() => Date.now())
  // Track which card just had an action for a brief "tap feedback" flash
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  // Undo toast for destructive marks (no_show). Auto-dismisses in 3s.
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null)
  // When set, the TablePickerModal is open for this reservation. We stash the
  // full row (not just the id) so the modal can keep rendering its header and
  // currently-assigned tables even if `items` is re-fetched in the background.
  const [pickerFor, setPickerFor] = useState<Reservation | null>(null)
  // All active restaurant tables — fetched once on mount. Drives the
  // smart-pill recommendation engine and will be reused by the picker
  // once we pass it down as a prop (saves a second round-trip when it
  // opens). Tables change rarely enough that a 60s poll isn't worth it.
  const [tables, setTables] = useState<TableLite[]>([])
  // Only one row is expanded at a time — auto-collapse siblings so the
  // hostess always has a short, scannable list. Rows that transition to
  // arrived/no_show are auto-closed via the effect below.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/reservations', { cache: 'no-store' })
      if (res.status === 401) {
        router.replace('/host/login')
        return
      }
      if (!res.ok) {
        setError('שגיאה בטעינת הזמנות')
        return
      }
      const data = await res.json()
      // Belt-and-suspenders: the server already filters to the shift day for a
      // host-only request, but if the same browser also carries an admin cookie
      // the server returns the full dataset. Filter on the client too so the
      // hostess view is always scoped to "today" regardless of which cookie won.
      const shiftDateStr = computeShiftDateStr(new Date())
      const todays = (data.reservations || []).filter(
        (r: Reservation) => r.date === shiftDateStr
      )
      setItems(todays)
      setError('')
    } catch {
      setError('אין חיבור לשרת')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(() => {
      // Pause the periodic refresh while the picker is open so an in-flight
      // network response can't stomp on the user's open selection. Once they
      // save or cancel, the next tick will resume.
      if (pickerFor) return
      load()
    }, 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerFor])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Tables fetch — one-shot on mount. If this 401s or otherwise fails,
  // the smart pill simply degrades to the classic "שייך" flow; nothing
  // else on the page depends on it.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/map/tables', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: TableLite[]) => {
        if (!cancelled) setTables(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        // no-op — the pill falls back to the picker flow
      })
    return () => {
      cancelled = true
    }
  }, [])

  // One-tap "שבצי שולחן N". Optimistically builds an assignment from the
  // TableLite we already have in memory so the pill flips instantly to
  // the burgundy "🪑 שולחן N · עריכה" state. An undo toast reverts via
  // DELETE if the hostess taps it within 3s. On network failure we
  // reload to resync.
  async function quickAssign(reservationId: string, tableId: string) {
    const prev = items.find(r => r.id === reservationId)
    const table = tables.find(t => t.id === tableId)
    if (!prev || !table) return

    setPendingAction(reservationId)
    const optimistic: AssignedTable = {
      id: table.id,
      tableNumber: table.table_number,
      label: table.label,
      area: table.area,
      capacityMin: table.capacity_min,
      capacityMax: table.capacity_max,
      isPrimary: true,
    }
    setItems(p => p.map(r => (r.id === reservationId ? { ...r, tables: [optimistic] } : r)))
    try {
      const res = await fetch(`/api/reservations/${reservationId}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableIds: [tableId], primaryTableId: tableId }),
      })
      if (!res.ok) {
        await load()
        return
      }
      const data = await res.json()
      setItems(p =>
        p.map(r => (r.id === reservationId ? { ...r, tables: data.tables || [] } : r)),
      )
      setUndoToast({
        message: `שובצה לשולחן ${table.table_number} – ${prev.name}`,
        onUndo: async () => {
          setUndoToast(null)
          // Optimistic revert; server call is fire-and-forget. If it
          // fails the next load() tick will resync.
          setItems(p => p.map(r => (r.id === reservationId ? { ...r, tables: [] } : r)))
          try {
            await fetch(`/api/reservations/${reservationId}/tables`, { method: 'DELETE' })
          } catch {
            /* swallowed — next poll corrects state */
          }
        },
      })
    } catch {
      await load()
    } finally {
      setPendingAction(null)
    }
  }

  async function setStatus(id: string, status: Status) {
    // Capture the previous status BEFORE the optimistic mutation so the undo
    // toast (for destructive marks) can revert exactly to where we were.
    const prev = items.find(r => r.id === id)
    const prevStatus = prev?.status

    setPendingAction(id)
    setItems(p => p.map(r => (r.id === id ? { ...r, status } : r)))
    if (prev) {
      const name = prev.name || 'הזמנה ללא שם'
      const verb =
        status === 'arrived' ? 'סומן/ה כהגיע/ה'
        : status === 'no_show' ? 'סומן/ה כלא הגיע/ה'
        : status === 'confirmed' ? 'שוחזר/ה לאישור'
        : 'סטטוס עודכן'
      setAnnounce(`${name} ${verb} בשעה ${prev.time}`)
    }
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        await load()
        return
      }
      // Surface an undo affordance on destructive marks. A misfired swipe
      // during service is the failure mode this guards against.
      if (status === 'no_show' && prevStatus && prevStatus !== 'no_show') {
        setUndoToast({
          message: `סומן "לא הגיע/ה" – ${prev?.name ?? ''}`,
          onUndo: () => {
            setUndoToast(null)
            setStatus(id, prevStatus)
          },
        })
      }
    } catch {
      await load()
    } finally {
      setPendingAction(null)
    }
  }

  async function logout() {
    await fetch('/api/host/logout', { method: 'POST' })
    router.replace('/host/login')
  }

  const enriched: Enriched[] = useMemo(() => enrich(items, now, tables), [items, now, tables])

  // Auto-collapse the expanded row once it transitions to arrived/no_show
  // (previously handled inside ReservationRow itself; now that expand
  // state lives here, the parent owns the rule).
  useEffect(() => {
    if (!expandedId) return
    const row = items.find(r => r.id === expandedId)
    if (!row || row.status === 'arrived' || row.status === 'no_show') {
      setExpandedId(null)
    }
  }, [items, expandedId])

  const lateItems = enriched.filter(r => r.bucket === 'late')
  const soonItems = enriched.filter(r => r.bucket === 'soon')
  const upcomingItems = enriched.filter(r => r.bucket === 'upcoming')
  const arrivedItems = enriched.filter(r => r.bucket === 'arrived')
  const noShowItems = enriched.filter(r => r.bucket === 'no_show')
  const otherItems = enriched.filter(r => r.bucket === 'other')

  const byTimeAsc = (a: Enriched, b: Enriched) => a.time.localeCompare(b.time)
  const byLateDesc = (a: Enriched, b: Enriched) => b.lateMinutes - a.lateMinutes

  // Active list — what the hostess needs to act on. Marked reservations
  // (arrived / no-show) live on /host/marked instead.
  const activeList: Enriched[] = [
    ...lateItems.sort(byLateDesc),
    ...soonItems.sort(byTimeAsc),
    ...upcomingItems.sort(byTimeAsc),
    ...otherItems.sort(byTimeAsc),
  ]
  const markedCount = arrivedItems.length + noShowItems.length

  // Headline stat — total guests on the books today. Count only reservations
  // the shift actually serves (confirmed/arrived/no_show).
  const servedStatuses: Status[] = ['confirmed', 'arrived', 'no_show']
  const expectedGuests = items
    .filter(r => servedStatuses.includes(r.status))
    .reduce((sum, r) => sum + r.guests, 0)

  // Header label uses the shift day, not the calendar day.
  const shiftDate = shiftAdjustedDate(new Date(now))
  const todayLabel = `יום ${HEBREW_DAYS[shiftDate.getDay()]}, ${shiftDate.getDate()} ${HEBREW_MONTHS[shiftDate.getMonth()]}`

  return (
    <div className="min-h-screen bg-white pb-12">
      {/* Header */}
      <header className="border-b-2 border-cayo-burgundy/10 bg-white sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[60px] overflow-hidden">
              <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
            </div>
            <div>
              <h1 className="text-lg font-black text-cayo-burgundy leading-tight">משמרת</h1>
              <p className="text-xs text-cayo-burgundy/80 leading-tight">{todayLabel}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-sm font-bold text-cayo-burgundy hover:text-cayo-burgundy px-4 py-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cayo-burgundy/60 focus-visible:ring-offset-2"
          >
            יציאה
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-5">
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announce}
        </div>
        {/* Top row: single stat card + link to marked list */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Stat
            label="הזמנות היום"
            value={String(expectedGuests)}
            sub="סועדים"
          />
          <Link
            href="/host/marked"
            className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5 hover:border-cayo-burgundy/40 active:scale-[0.98] transition flex flex-col justify-center"
          >
            <p className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider">
              מסומנות
            </p>
            <p className="text-xl font-black mt-0.5 text-cayo-burgundy">
              {markedCount}
            </p>
            <p className="text-[11px] font-bold text-cayo-burgundy/75 mt-0.5 leading-tight">
              הצג רשימה ←
            </p>
          </Link>
        </div>

        {/* Late banner — most important piece of the UI. When there's a
            single late reservation we surface a big call-now button right
            here so the hostess reacts with one tap from the top of the
            screen. When there are multiple, the per-row phone pills carry
            the action (we can't dial "all of them" at once). */}
        {lateItems.length > 0 && (
          <div className="mb-4 bg-cayo-red/10 border-2 border-cayo-red/40 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-cayo-red animate-pulse" aria-hidden="true" />
              <p className="text-cayo-red font-black text-sm">
                {lateItems.length === 1 ? 'הזמנה מאחרת' : `${lateItems.length} הזמנות מאחרות`}
              </p>
            </div>
            <p className="text-xs text-cayo-red/80 font-bold">
              יש להתקשר ולוודא הגעה, או לסמן &quot;לא הגיע/ה&quot;
            </p>
            {lateItems.length === 1 && lateItems[0].phone && (
              <a
                href={`tel:${lateItems[0].phone.replace(/[^\d+]/g, '')}`}
                className="mt-3 w-full h-11 rounded-xl bg-cayo-red text-white font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                aria-label={`התקשרי ל-${lateItems[0].name || 'הזמנה המאחרת'}`}
              >
                <span className="text-lg leading-none">📞</span>
                <span>
                  התקשרי {lateItems[0].name ? `ל-${lateItems[0].name}` : ''}
                </span>
              </a>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 bg-cayo-red/5 border-2 border-cayo-red/30 rounded-xl p-3 text-center text-sm font-bold text-cayo-red">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-16 font-bold">טוען...</p>
        ) : activeList.length === 0 && markedCount === 0 ? (
          <div className="py-16 text-center text-cayo-burgundy/40 font-bold border-2 border-dashed border-cayo-burgundy/20 rounded-2xl">
            אין הזמנות להיום
          </div>
        ) : activeList.length === 0 ? (
          <div className="py-10 text-center text-cayo-burgundy/40 font-bold border-2 border-dashed border-cayo-burgundy/20 rounded-2xl">
            כל ההזמנות סומנו
          </div>
        ) : (
          <>
            <ul className="space-y-2 list-none p-0">
              {activeList.map((r, idx) => {
                // Time section header — emitted whenever the time slot
                // changes. Makes the list scannable at a glance during a
                // busy service: the hostess's eye locks onto "20:30" and
                // sees the chunk of guests arriving at that slot.
                const prev = idx > 0 ? activeList[idx - 1] : null
                const showHeader = !prev || prev.time !== r.time
                let sameTimeCount = 0
                if (showHeader) {
                  for (let j = idx; j < activeList.length; j++) {
                    if (activeList[j].time === r.time) sameTimeCount++
                    else break
                  }
                }
                return (
                  <li key={r.id} className="space-y-2 list-none">
                    {showHeader && (
                      <div className={`flex items-center gap-2 ${idx === 0 ? '' : 'pt-2'}`}>
                        <h2 className="text-xs font-black text-cayo-burgundy/80 m-0" dir="ltr">
                          {r.time}
                        </h2>
                        <span className="text-[11px] font-bold text-cayo-burgundy/40" aria-hidden="true">·</span>
                        <span className="text-[11px] font-bold text-cayo-burgundy/75">
                          {sameTimeCount} {sameTimeCount === 1 ? 'הזמנה' : 'הזמנות'}
                        </span>
                        <span className="flex-1 border-t border-cayo-burgundy/10 ms-1" aria-hidden="true" />
                      </div>
                    )}
                    <ReservationRow
                      reservation={r}
                      pending={pendingAction === r.id}
                      onArrived={() => setStatus(r.id, 'arrived')}
                      onNoShow={() => setStatus(r.id, 'no_show')}
                      onUndo={() => setStatus(r.id, 'confirmed')}
                      onAssign={() => setPickerFor(r)}
                      onQuickAssign={(tableId) => quickAssign(r.id, tableId)}
                      isExpanded={expandedId === r.id}
                      onToggleExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    />
                  </li>
                )
              })}
            </ul>
            <p className="text-[11px] text-cayo-burgundy/75 text-center mt-3 font-bold">
              החליקי הזמנה ימינה לסימון מהיר · הקישי להצגת פרטים
            </p>
          </>
        )}
      </main>
      <UndoToast state={undoToast} onClose={() => setUndoToast(null)} />
      {pickerFor && (
        <TablePickerModal
          open={true}
          onClose={() => setPickerFor(null)}
          reservation={pickerFor}
          allReservations={items}
          onSaved={(tables: AssignedTable[]) => {
            setItems(prev =>
              prev.map(it => (it.id === pickerFor.id ? { ...it, tables } : it)),
            )
            setPickerFor(null)
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5">
      <p className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-xl font-black mt-0.5 text-cayo-burgundy">{value}</p>
      <p className="text-[11px] font-bold text-cayo-burgundy/75 mt-0.5 leading-tight">
        {sub}
      </p>
    </div>
  )
}
