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
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import cayoLogo from '../../cayo_brand_page_005.png'

type Status = 'pending' | 'confirmed' | 'cancelled' | 'arrived' | 'no_show'
type Area = 'bar' | 'table'

interface Reservation {
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
}

// A confirmed reservation is considered "late" this many minutes after its
// scheduled time if it hasn't been marked arrived/no_show yet.
const LATE_THRESHOLD_MIN = 15

const STATUS_LABEL: Record<Status, string> = {
  pending: 'ממתין',
  confirmed: 'מאושר',
  cancelled: 'בוטל',
  arrived: 'הגיע/ה',
  no_show: 'לא הגיע/ה',
}

const AREA_LABEL: Record<Area, string> = {
  bar: 'בר',
  table: 'שולחן',
}

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function toDateString(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// The hostess's "today" is the shift day: before 04:00 she's still on the
// previous calendar day's shift. This mirrors the server's shiftDayLocal().
function shiftAdjustedDate(now: Date): Date {
  const d = new Date(now)
  if (d.getHours() < 4) {
    d.setDate(d.getDate() - 1)
  }
  return d
}

function computeShiftDateStr(now: Date): string {
  return toDateString(shiftAdjustedDate(now))
}

// Convert a "HH:mm" string + a reference date into a Date in local time.
function timeOn(dateStr: string, time: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  return new Date(y, mo - 1, d, h, m, 0, 0)
}

function minutesDiff(a: number, b: number): number {
  return Math.round((a - b) / 60000)
}

type Bucket = 'late' | 'soon' | 'upcoming' | 'arrived' | 'no_show' | 'other'

interface Enriched extends Reservation {
  scheduled: Date
  minutesFromNow: number // positive = future, negative = past
  lateMinutes: number // 0 unless in "late" bucket
  bucket: Bucket
}

function bucketOf(r: Reservation, now: number): { bucket: Bucket; lateMinutes: number } {
  const scheduled = timeOn(r.date, r.time).getTime()
  const mins = minutesDiff(now, scheduled) // positive if past

  if (r.status === 'arrived') return { bucket: 'arrived', lateMinutes: 0 }
  if (r.status === 'no_show') return { bucket: 'no_show', lateMinutes: 0 }
  if (r.status === 'cancelled' || r.status === 'pending') {
    return { bucket: 'other', lateMinutes: 0 }
  }
  // status === 'confirmed' from here
  if (mins >= LATE_THRESHOLD_MIN) return { bucket: 'late', lateMinutes: mins }
  if (mins >= -30) return { bucket: 'soon', lateMinutes: 0 } // within next 30 min or already at time
  return { bucket: 'upcoming', lateMinutes: 0 }
}

export default function HostDashboard() {
  const router = useRouter()
  const [items, setItems] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // `now` ticks every 30s so late minutes update without a manual reload
  const [now, setNow] = useState<number>(() => Date.now())
  // Track which card just had an action for a brief "tap feedback" flash
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  // Done section (arrived/no-show) is collapsed by default — it only exists
  // for the hostess to undo a mistaken tap.
  const [showDone, setShowDone] = useState(false)

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

  // Initial load + auto-refresh every 60s so new reservations from the booking
  // form show up without the hostess having to pull-to-refresh
  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tick the clock — drives late countdowns and the "next in X min" chip
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  async function setStatus(id: string, status: Status) {
    setPendingAction(id)
    // Optimistic update so the tap feels instant on a tablet
    setItems(prev => prev.map(r => (r.id === id ? { ...r, status } : r)))
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        // Roll back: reload canonical state from server
        await load()
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

  // Everything we show is today — the API already filters for host sessions.
  // We still group+sort client-side so the `now` tick can reorder without
  // hitting the server.
  const enriched: Enriched[] = useMemo(() => {
    return items.map(r => {
      const scheduled = timeOn(r.date, r.time)
      const { bucket, lateMinutes } = bucketOf(r, now)
      return {
        ...r,
        scheduled,
        minutesFromNow: minutesDiff(scheduled.getTime(), now),
        lateMinutes,
        bucket,
      }
    })
  }, [items, now])

  const lateItems = enriched.filter(r => r.bucket === 'late')
  const soonItems = enriched.filter(r => r.bucket === 'soon')
  const upcomingItems = enriched.filter(r => r.bucket === 'upcoming')
  const arrivedItems = enriched.filter(r => r.bucket === 'arrived')
  const noShowItems = enriched.filter(r => r.bucket === 'no_show')
  const otherItems = enriched.filter(r => r.bucket === 'other') // pending / cancelled

  // Sort helpers
  const byTimeAsc = (a: Enriched, b: Enriched) => a.time.localeCompare(b.time)
  const byLateDesc = (a: Enriched, b: Enriched) => b.lateMinutes - a.lateMinutes

  // Active list — what the hostess needs to act on. Marked reservations
  // (arrived / no-show) are pulled out and shown in a separate collapsible
  // section below so they don't clutter the working list but remain reachable
  // for quick undo if she tapped the wrong button.
  const activeList: Enriched[] = [
    ...lateItems.sort(byLateDesc),
    ...soonItems.sort(byTimeAsc),
    ...upcomingItems.sort(byTimeAsc),
    ...otherItems.sort(byTimeAsc),
  ]
  const doneList: Enriched[] = [
    ...arrivedItems.sort(byTimeAsc),
    ...noShowItems.sort(byTimeAsc),
  ]

  // Headline stats — only count reservations that the shift actually serves
  // (confirmed/arrived/no_show; ignore pending and cancelled).
  const servedStatuses: Status[] = ['confirmed', 'arrived', 'no_show']
  const relevant = items.filter(r => servedStatuses.includes(r.status))
  const expectedGuests = relevant.reduce((sum, r) => sum + r.guests, 0)
  const arrivedGuests = items
    .filter(r => r.status === 'arrived')
    .reduce((sum, r) => sum + r.guests, 0)

  const nextUp = [...soonItems, ...upcomingItems].sort(byTimeAsc)[0] || null

  // Header label uses the shift day, not the calendar day: after midnight
  // the hostess is still working "Monday night" until 04:00 on Tuesday.
  const shiftDate = shiftAdjustedDate(now)
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
              <p className="text-xs text-cayo-burgundy/60 leading-tight">{todayLabel}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-sm font-bold text-cayo-burgundy/70 hover:text-cayo-burgundy px-3 py-1.5"
          >
            יציאה
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-5">
        {/* Shift stats — single card: total guests expected today */}
        <div className="mb-4">
          <Stat
            label="הזמנות היום"
            value={String(expectedGuests)}
            sub="סועדים"
          />
        </div>

        {/* Late banner — most important piece of the UI */}
        {lateItems.length > 0 && (
          <div className="mb-4 bg-cayo-red/10 border-2 border-cayo-red/40 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-cayo-red animate-pulse" />
              <p className="text-cayo-red font-black text-sm">
                {lateItems.length === 1 ? 'הזמנה מאחרת' : `${lateItems.length} הזמנות מאחרות`}
              </p>
            </div>
            <p className="text-xs text-cayo-red/80 font-bold">
              יש להתקשר ולוודא הגעה, או לסמן &quot;לא הגיע/ה&quot;
            </p>
          </div>
        )}

        {/* Error / loading states */}
        {error && (
          <div className="mb-4 bg-cayo-red/5 border-2 border-cayo-red/30 rounded-xl p-3 text-center text-sm font-bold text-cayo-red">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-16 font-bold">טוען...</p>
        ) : activeList.length === 0 && doneList.length === 0 ? (
          <div className="py-16 text-center text-cayo-burgundy/40 font-bold border-2 border-dashed border-cayo-burgundy/20 rounded-2xl">
            אין הזמנות להיום
          </div>
        ) : (
          <>
            {/* Active list — the working queue */}
            {activeList.length > 0 ? (
              <>
                <div className="space-y-2">
                  {activeList.map(r => (
                    <ReservationRow
                      key={r.id}
                      reservation={r}
                      pending={pendingAction === r.id}
                      onArrived={() => setStatus(r.id, 'arrived')}
                      onNoShow={() => setStatus(r.id, 'no_show')}
                      onUndo={() => setStatus(r.id, 'confirmed')}
                    />
                  ))}
                </div>
                {/* Swipe hint */}
                <p className="text-[11px] text-cayo-burgundy/40 text-center mt-3 font-bold">
                  החליקי הזמנה ימינה לסימון מהיר · הקישי להצגת פרטים
                </p>
              </>
            ) : (
              <div className="py-10 text-center text-cayo-burgundy/40 font-bold border-2 border-dashed border-cayo-burgundy/20 rounded-2xl">
                כל ההזמנות סומנו
              </div>
            )}

            {/* Marked (done) section — collapsed by default, for undo only */}
            {doneList.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowDone(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-cayo-burgundy/5 hover:bg-cayo-burgundy/10 rounded-xl border-2 border-cayo-burgundy/10 transition-colors"
                >
                  <span className="text-sm font-black text-cayo-burgundy/70">
                    מסומנות ({doneList.length})
                  </span>
                  <span className="flex items-center gap-2 text-xs font-bold text-cayo-burgundy/50">
                    <span>
                      {arrivedItems.length} הגיעו · {noShowItems.length} לא הגיעו
                    </span>
                    <span className="text-cayo-burgundy/40">
                      {showDone ? '▲' : '▼'}
                    </span>
                  </span>
                </button>

                {showDone && (
                  <div className="space-y-2 mt-2">
                    {doneList.map(r => (
                      <ReservationRow
                        key={r.id}
                        reservation={r}
                        pending={pendingAction === r.id}
                        onArrived={() => setStatus(r.id, 'arrived')}
                        onNoShow={() => setStatus(r.id, 'no_show')}
                        onUndo={() => setStatus(r.id, 'confirmed')}
                      />
                    ))}
                    <p className="text-[11px] text-cayo-burgundy/40 text-center mt-2 font-bold">
                      הקישי על הזמנה ואז &quot;ביטול סימון&quot; כדי להחזיר אותה לרשימה
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ───── Small presentational components ─────

function Stat({
  label,
  value,
  sub,
  emphasis = 'neutral',
}: {
  label: string
  value: string
  sub: string
  emphasis?: 'neutral' | 'red'
}) {
  const valueCls =
    emphasis === 'red' ? 'text-cayo-red' : 'text-cayo-burgundy'
  return (
    <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5">
      <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-xl font-black mt-0.5 ${valueCls}`}>{value}</p>
      <p className="text-[11px] font-bold text-cayo-burgundy/50 mt-0.5 leading-tight">
        {sub}
      </p>
    </div>
  )
}

// Compact list row. Tap to expand (shows phone + notes). Swipe right to
// reveal the two primary actions (arrived / no-show).
//
// Interaction model:
// - A horizontal drag past ~30% of OPEN_OFFSET snaps the row open.
// - When open: the two action buttons are clickable; tapping the card body
//   closes it without toggling "expanded".
// - When closed: tapping the card toggles the expanded details panel.
// - Once a reservation is marked done (arrived/no_show) the row collapses
//   its swipe state and no longer responds to horizontal drags.
function ReservationRow({
  reservation: r,
  pending,
  onArrived,
  onNoShow,
  onUndo,
}: {
  reservation: Enriched
  pending: boolean
  onArrived: () => void
  onNoShow: () => void
  onUndo: () => void
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

  // When the server confirms a done state, collapse both swipe and expand
  // so the row doesn't look "stuck open" after the action.
  useEffect(() => {
    if (isDone) {
      setHasTransition(true)
      setOffset(0)
      setExpanded(false)
    }
  }, [isDone])

  function onTouchStart(e: any) {
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

  function onTouchMove(e: any) {
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
    if (next < 0) next = next * 0.3 // light rubber-band when dragging past 0
    if (next > OPEN_OFFSET) next = OPEN_OFFSET + (next - OPEN_OFFSET) * 0.3
    setOffset(next)
  }

  function onTouchEnd() {
    const d = drag.current
    if (d.decided === 'horizontal' && d.didMove) {
      setHasTransition(true)
      setOffset(offset > OPEN_OFFSET * 0.35 ? OPEN_OFFSET : 0)
    }
    // didMove lingers briefly so the synthetic click that follows touchend
    // doesn't toggle expanded accidentally
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

  function triggerArrived(e: any) {
    e.stopPropagation()
    setOffset(0)
    onArrived()
  }
  function triggerNoShow(e: any) {
    e.stopPropagation()
    setOffset(0)
    onNoShow()
  }
  function triggerUndo(e: any) {
    e.stopPropagation()
    onUndo()
  }

  // Row colors — border + background tint keyed to state
  const rowCls = isLate
    ? 'border-cayo-red bg-cayo-red/5'
    : isArrived
    ? 'border-cayo-teal/40 bg-cayo-teal/5'
    : isNoShow
    ? 'border-black/15 bg-black/5 opacity-75'
    : isSoon
    ? 'border-cayo-orange/50 bg-cayo-orange/5'
    : 'border-cayo-burgundy/15 bg-white'

  const timeBadgeCls = isLate
    ? 'bg-cayo-red text-white'
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
      {/* Swipe action layer — sits behind the card at the physical left edge.
          Revealed when the card translates right. Order (logical, in RTL):
          no-show on the far edge (reached first by a short swipe), arrived
          next to the card (reached by a fuller commit swipe). */}
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

      {/* Card body — slides over the action layer */}
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
        {/* Compact row — always visible */}
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
                  <span className="text-cayo-red font-black">
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

          <span
            className="text-cayo-burgundy/40 text-xs font-black px-1"
            aria-hidden="true"
          >
            {expanded ? '▲' : '▼'}
          </span>
        </div>

        {/* Expanded details — phone + notes + per-state action */}
        {expanded && (
          <div className="px-4 pb-3 pt-1 border-t border-cayo-burgundy/10">
            {(r.phone || r.notes) ? (
              <div className="space-y-2">
                {r.phone && (
                  <a
                    href={`tel:${r.phone}`}
                    onClick={e => e.stopPropagation()}
                    dir="ltr"
                    className={`w-full h-11 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
                      isLate
                        ? 'bg-cayo-red text-white'
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
              </div>
            ) : (
              <p className="text-xs text-cayo-burgundy/45 text-center py-1.5 font-bold">
                אין פרטים נוספים
              </p>
            )}

            {isDone && (
              <button
                onClick={triggerUndo}
                disabled={pending}
                className="w-full h-10 mt-2 rounded-xl border-2 border-cayo-burgundy/20 text-cayo-burgundy/70 font-bold text-xs hover:border-cayo-burgundy/50 disabled:opacity-50"
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
