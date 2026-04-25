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
  ReservationDetailModal,
  ReservationRow,
  Status,
  TableLite,
  computeShiftDateStr,
  enrich,
  shiftAdjustedDate,
  toDateString,
  GuestScrollPicker,
  ModalField,
  ZONE_ORDER,
  ZONE_LABEL,
  tableZone,
} from './shared'
import { UndoToast, UndoToastState } from '../../components/UndoToast'

export default function HostDashboard() {
  const router = useRouter()
  const [items, setItems] = useState<Reservation[]>([])
  const [totalCapacity, setTotalCapacity] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Logged-in hostess identity — shown in the header so multiple users
  // sharing a tablet can see who's currently signed in. Fetched once on
  // mount; null until loaded (or if the session cookie is invalid — in
  // which case the user would've already been redirected to /host/login).
  const [hostUser, setHostUser] = useState<{ full_name: string } | null>(null)
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
  // Detail modal — when set, shows the full reservation detail/edit modal.
  const [editingReservation, setEditingReservation] = useState<Enriched | null>(null)
  const [showNewReservation, setShowNewReservation] = useState(false)
  // Day navigation: 0 = today's shift, negative = past days, positive = future
  const [dayOffset, setDayOffset] = useState(0)
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  // Calendar display month/year (independent of selected day so user can browse)
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())

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
      // Server returns the full dataset (both admin and host sessions). The
      // day picker in the header sets `dayOffset`; we filter down to just the
      // selected shift day here so the list stays focused per-day.
      const baseShiftDate = shiftAdjustedDate(new Date())
      baseShiftDate.setDate(baseShiftDate.getDate() + dayOffset)
      const shiftDateStr = toDateString(baseShiftDate)
      const todays = (data.reservations || []).filter(
        (r: Reservation) => r.date === shiftDateStr
      )
      setItems(todays)
      if (typeof data.totalCapacity === 'number') setTotalCapacity(data.totalCapacity)
      setError('')
    } catch {
      setError('אין חיבור לשרת')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
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
  }, [pickerFor, dayOffset])

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

  // Fetch the identity of the currently signed-in hostess for the header.
  // We don't gate the dashboard on this — server-side redirects already
  // handle unauthenticated access. If /me returns 401 we silently stay
  // anonymous (the page itself will have redirected).
  useEffect(() => {
    let cancelled = false
    fetch('/api/host/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.full_name) setHostUser({ full_name: data.full_name })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const enriched: Enriched[] = useMemo(() => enrich(items, now, tables), [items, now, tables])

  async function updateReservation(id: string, updates: Partial<Reservation>) {
    setItems(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
    setEditingReservation(prev => prev && prev.id === id ? { ...prev, ...updates } : prev)
  }

  const lateItems = enriched.filter(r => r.bucket === 'late')
  const soonItems = enriched.filter(r => r.bucket === 'soon')
  const upcomingItems = enriched.filter(r => r.bucket === 'upcoming')
  const arrivedItems = enriched.filter(r => r.bucket === 'arrived')
  const noShowItems = enriched.filter(r => r.bucket === 'no_show')
  const completedItems = enriched.filter(r => r.bucket === 'completed')
  const otherItems = enriched.filter(r => r.bucket === 'other')

  const byTimeAsc = (a: Enriched, b: Enriched) => a.time.localeCompare(b.time)
  const byLateDesc = (a: Enriched, b: Enriched) => b.lateMinutes - a.lateMinutes

  // Active list — what the hostess needs to act on. Marked reservations
  // (arrived / no-show / completed-after-clear) live on /host/marked instead.
  const activeList: Enriched[] = [
    ...lateItems.sort(byLateDesc),
    ...soonItems.sort(byTimeAsc),
    ...upcomingItems.sort(byTimeAsc),
    ...otherItems.sort(byTimeAsc),
  ]
  const markedCount = arrivedItems.length + noShowItems.length + completedItems.length

  // Headline stat — total guests on the books today. Count only reservations
  // the shift actually serves (confirmed/arrived/no_show).
  const servedStatuses: Status[] = ['confirmed', 'arrived', 'no_show']
  const expectedGuests = items
    .filter(r => servedStatuses.includes(r.status))
    .reduce((sum, r) => sum + r.guests, 0)
  const freeSeats = totalCapacity !== null ? Math.max(0, totalCapacity - expectedGuests) : null

  // Header label uses the shift day + dayOffset.
  const shiftDate = shiftAdjustedDate(new Date(now))
  const selectedDate = new Date(shiftDate)
  selectedDate.setDate(selectedDate.getDate() + dayOffset)
  const todayLabel = `יום ${HEBREW_DAYS[selectedDate.getDay()]}, ${selectedDate.getDate()} ${HEBREW_MONTHS[selectedDate.getMonth()]}`
  const isToday = dayOffset === 0

  return (
    <div className="min-h-screen bg-white pb-12">
      {/* Header */}
      <header className="border-b-2 border-cayo-burgundy/10 bg-white sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          {/* Day picker box — top-left */}
          <div className="relative">
            <button
              onClick={() => setDayPickerOpen(o => !o)}
              className="flex flex-col items-start px-3 py-2 rounded-xl border-2 border-cayo-burgundy/15 hover:border-cayo-burgundy/40 active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cayo-burgundy/60 min-w-[130px]"
            >
              <span className="text-[10px] font-bold text-cayo-burgundy/60 uppercase tracking-wider leading-tight">
                {isToday ? 'היום' : 'תאריך'}
              </span>
              <span className="text-sm font-black text-cayo-burgundy leading-snug">{todayLabel}</span>
            </button>
            {dayPickerOpen && (() => {
              // Build calendar grid for calMonth/calYear
              const firstDay = new Date(calYear, calMonth, 1)
              // In Israel Sunday=0 is first day of week
              const startDow = firstDay.getDay() // 0=Sun
              const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
              // Today's shift date for "today" highlight
              const todayShift = shiftAdjustedDate(new Date())
              const todayStr = toDateString(todayShift)
              // Currently selected date
              const selDate = new Date(shiftDate)
              selDate.setDate(selDate.getDate() + dayOffset)
              const selStr = toDateString(selDate)

              const cells: (number | null)[] = []
              for (let i = 0; i < startDow; i++) cells.push(null)
              for (let d = 1; d <= daysInMonth; d++) cells.push(d)
              // pad to full rows
              while (cells.length % 7 !== 0) cells.push(null)

              const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

              return (
                <div className="absolute top-full mt-2 right-0 bg-white border-2 border-cayo-burgundy/15 rounded-2xl shadow-lg z-50 p-3 w-[260px]">
                  {/* Month navigation */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => {
                        if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
                        else setCalMonth(m => m - 1)
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-cayo-burgundy hover:bg-cayo-burgundy/8 font-black text-base transition"
                      aria-label="חודש קדימה"
                    >›</button>
                    <span className="text-sm font-black text-cayo-burgundy">
                      {HEBREW_MONTHS[calMonth]} {calYear}
                    </span>
                    <button
                      onClick={() => {
                        if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
                        else setCalMonth(m => m + 1)
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-cayo-burgundy hover:bg-cayo-burgundy/8 font-black text-base transition"
                      aria-label="חודש אחורה"
                    >‹</button>
                  </div>
                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_LABELS.map(d => (
                      <div key={d} className="text-center text-[10px] font-bold text-cayo-burgundy/40 py-0.5">{d}</div>
                    ))}
                  </div>
                  {/* Date cells */}
                  <div className="grid grid-cols-7 gap-y-0.5">
                    {cells.map((day, i) => {
                      if (!day) return <div key={i} />
                      const dateStr = toDateString(new Date(calYear, calMonth, day))
                      const isSelected = dateStr === selStr
                      const isTodayCell = dateStr === todayStr
                      // Compute offset from shift base for this cell
                      const cellDate = new Date(calYear, calMonth, day)
                      const diffMs = cellDate.getTime() - new Date(todayShift.getFullYear(), todayShift.getMonth(), todayShift.getDate()).getTime()
                      const diffDays = Math.round(diffMs / 86400000)
                      return (
                        <button
                          key={i}
                          onClick={() => { setDayOffset(diffDays); setDayPickerOpen(false) }}
                          className={`h-8 w-full rounded-lg text-sm font-bold transition relative
                            ${isSelected
                              ? 'bg-cayo-burgundy text-white'
                              : isTodayCell
                              ? 'text-cayo-burgundy border-2 border-cayo-burgundy/40 hover:bg-cayo-burgundy/8'
                              : 'text-cayo-burgundy hover:bg-cayo-burgundy/8'}`}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-black text-cayo-burgundy leading-tight text-end">משמרת</h1>
            </div>
            <div className="w-[60px] overflow-hidden">
              <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
            </div>
          </div>
        </div>
        {/* Identity + logout row. The name is mostly for shared-tablet use
            — lets the next hostess see "oh, it's still on Dana's session"
            and switch users before marking anything. */}
        <div className="max-w-3xl mx-auto px-5 pb-2 flex items-center justify-between">
          <button
            onClick={logout}
            className="text-xs font-bold text-cayo-burgundy/60 hover:text-cayo-burgundy transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cayo-burgundy/60 focus-visible:ring-offset-2 py-1"
          >
            {hostUser ? 'החלף משתמש' : 'יציאה'}
          </button>
          {hostUser && (
            <span className="text-xs font-bold text-cayo-burgundy/70">
              שלום, {hostUser.full_name}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-5">
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announce}
        </div>
        {/* Top row: single stat card + link to marked list */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5 flex items-stretch gap-3">
            {freeSeats !== null && (
              <>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider">מקומות פנויים</p>
                  <p className="text-xl font-black mt-0.5 text-cayo-teal">{freeSeats}</p>
                  <p className="text-[11px] font-bold text-cayo-burgundy/75 mt-0.5 leading-tight">מתוך {totalCapacity}</p>
                </div>
                <div className="w-px bg-cayo-burgundy/10 self-stretch" />
              </>
            )}
            <div className="flex-1">
              <p className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider">הזמנות היום</p>
              <p className="text-xl font-black mt-0.5 text-cayo-burgundy">{expectedGuests}</p>
              <p className="text-[11px] font-bold text-cayo-burgundy/75 mt-0.5 leading-tight">סועדים</p>
            </div>
          </div>
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

        {error && (
          <div className="mb-4 bg-cayo-red/5 border-2 border-cayo-red/30 rounded-xl p-3 text-center text-sm font-bold text-cayo-red">
            {error}
          </div>
        )}

        {/* Add reservation button */}
        <div className="flex justify-start mb-3">
          <button
            onClick={() => setShowNewReservation(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-cayo-burgundy/20 text-cayo-burgundy font-black text-sm hover:border-cayo-burgundy/50 hover:bg-cayo-burgundy/5 active:scale-[0.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cayo-burgundy/60"
            aria-label="הוסף הזמנה"
          >
            <span className="text-lg leading-none">+</span>
            <span>הזמנה חדשה</span>
          </button>
        </div>

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
                      onEdit={() => setEditingReservation(r)}
                    />
                  </li>
                )
              })}
            </ul>
            <p className="text-[11px] text-cayo-burgundy/75 text-center mt-3 font-bold">
              הקישי להצגת פרטים · החליקי ימינה לסימון מהיר
            </p>
          </>
        )}
      </main>
      <UndoToast state={undoToast} onClose={() => setUndoToast(null)} />
      {editingReservation && (
        <ReservationDetailModal
          reservation={editingReservation}
          onClose={() => setEditingReservation(null)}
          onSaved={(updates) => updateReservation(editingReservation.id, updates)}
          allTables={tables}
          allReservations={items}
        />
      )}
      {showNewReservation && (
        <NewReservationModal
          dateStr={toDateString(selectedDate)}
          dateLabel={todayLabel}
          allTables={tables}
          onClose={() => setShowNewReservation(false)}
          onCreated={() => { setShowNewReservation(false); load() }}
        />
      )}
    </div>
  )
}

const VALID_TIMES_HOST = (() => {
  const out: string[] = []
  for (let h = 19; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 0) break
      out.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return out
})()

function NewReservationModal({
  dateStr,
  dateLabel,
  allTables,
  onClose,
  onCreated,
}: {
  dateStr: string
  dateLabel: string
  allTables: TableLite[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [time, setTime] = useState(VALID_TIMES_HOST[0])
  const [guests, setGuests] = useState(2)
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState<TableLite | null>(null)
  const [tableSaving, setTableSaving] = useState(false)
  const [tableError, setTableError] = useState('')
  // Accordion: only one zone's table grid is visible at a time. Tapping a
  // zone chip opens its grid; tapping the same chip again closes it. Tapping
  // a different chip replaces the open one. No zone open by default so the
  // hostess sees only the three chips when she first opens the picker.
  const [expandedZone, setExpandedZone] = useState<null | 'window' | 'sofas' | 'bar' | 'other'>(null)

  async function submit() {
    setSaving(true)
    setSaveError('')
    try {
      const area: 'bar' | 'table' = selectedTable ? selectedTable.area : 'table'
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'אורח/ת', date: dateStr, time, area, guests, phone: phone.trim(), email: '', terms: true, notes }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error || 'שגיאה בשמירה'); return }
      if (selectedTable && data.id) {
        setTableSaving(true)
        await fetch(`/api/reservations/${data.id}/tables`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableIds: [selectedTable.id], primaryTableId: selectedTable.id }),
        })
        setTableSaving(false)
      }
      onCreated()
    } catch {
      setSaveError('שגיאה בחיבור')
    } finally {
      setSaving(false)
    }
  }

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
        <div className="px-5 py-4 border-b-2 border-cayo-burgundy/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-cayo-burgundy leading-tight">הזמנה חדשה</h2>
              <p className="text-xs font-black text-cayo-burgundy mt-0.5">{dateLabel}</p>
            </div>
            <button onClick={onClose} className="text-cayo-burgundy/40 hover:text-cayo-burgundy text-xl leading-none p-1 shrink-0" aria-label="סגור">✕</button>
          </div>
        </div>

        {/* Name */}
        <div className="px-5 py-3 border-b-2 border-black/15">
          <ModalField label="שם">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="אורח/ת"
              className="w-full text-sm font-black text-cayo-burgundy bg-transparent border-b border-cayo-burgundy/20 pb-0.5 focus:outline-none focus:border-cayo-burgundy/60 placeholder:text-cayo-burgundy/30"
            />
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
                {selectedTable ? `${selectedTable.table_number}` : '—'}
              </button>
              {tablePickerOpen && (
                <div className="mt-2">
                  {allTables.length === 0 ? (
                    <p className="text-xs font-bold text-cayo-burgundy/50">אין שולחנות</p>
                  ) : (
                    <>
                      {/* Row of compact zone chips. Tapping a chip expands
                          only its tables beneath; tapping again collapses. */}
                      <div className="flex gap-1.5 flex-wrap">
                        {ZONE_ORDER.map(zone => {
                          const zoneTables = allTables.filter(t => tableZone(t.table_number) === zone)
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
                      {expandedZone && (() => {
                        const zoneTables = allTables
                          .filter(t => tableZone(t.table_number) === expandedZone)
                          .sort((a, b) => a.table_number - b.table_number)
                        return (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {zoneTables.map(t => (
                              <button
                                key={t.id}
                                onClick={e => { e.stopPropagation(); setSelectedTable(t); setTablePickerOpen(false); setExpandedZone(null) }}
                                className={`w-9 h-9 rounded-lg border-2 text-sm font-black transition-colors
                                  ${selectedTable?.id === t.id
                                    ? 'bg-cayo-burgundy text-white border-cayo-burgundy'
                                    : 'border-cayo-burgundy/20 text-cayo-burgundy hover:bg-cayo-burgundy hover:text-white'}`}
                              >
                                {t.table_number}
                              </button>
                            ))}
                          </div>
                        )
                      })()}
                    </>
                  )}
                  {tableError && <p className="text-xs font-bold text-cayo-red mt-1.5">{tableError}</p>}
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
              className="text-sm font-black text-cayo-burgundy bg-transparent border-b border-cayo-burgundy/20 pb-0.5 focus:outline-none focus:border-cayo-burgundy/60 w-full"
            >
              {VALID_TIMES_HOST.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </ModalField>
          <ModalField label="טלפון">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="05X-XXXXXXX"
              dir="ltr"
              className="w-full text-sm font-black text-cayo-burgundy bg-transparent border-b border-cayo-burgundy/20 pb-0.5 focus:outline-none focus:border-cayo-burgundy/60 placeholder:text-cayo-burgundy/30"
            />
          </ModalField>
        </div>

        {/* Notes */}
        <div className="px-5 py-3 border-b-2 border-black/15">
          <ModalField label="בקשת לקוח">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="בקשות מיוחדות..."
              className="w-full text-sm font-black text-cayo-burgundy bg-transparent border-b border-cayo-burgundy/20 pb-0.5 focus:outline-none focus:border-cayo-burgundy/60 placeholder:text-cayo-burgundy/30 resize-none"
            />
          </ModalField>
        </div>

        {saveError && (
          <div className="px-5 py-2">
            <p className="text-xs font-bold text-cayo-red text-center">{saveError}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex justify-end">
          <button
            onClick={submit}
            disabled={saving || tableSaving}
            className="h-11 px-6 rounded-xl bg-cayo-tealDark text-white font-black text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {saving || tableSaving ? 'שומר...' : 'שמור הזמנה'}
          </button>
        </div>
      </div>
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
