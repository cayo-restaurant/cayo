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

  async function setStatus(id: string, status: Status) {
    // Capture the previous status BEFORE the optimistic mutation so the undo
    // toast (for destructive marks) can revert exactly to where we were.
    const prev = items.find(r => r.id === id)
    const prevStatus = prev?.status

    setPendingAction(id)
    setItems(p => p.map(r => (r.id === id ? { ...r, status } : r)))
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

  const enriched: Enriched[] = useMemo(() => enrich(items, now), [items, now])

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
            <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
              מסומנות
            </p>
            <p className="text-xl font-black mt-0.5 text-cayo-burgundy">
              {markedCount}
            </p>
            <p className="text-[11px] font-bold text-cayo-burgundy/50 mt-0.5 leading-tight">
              הצג רשימה ←
            </p>
          </Link>
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
            <div className="space-y-2">
              {activeList.map(r => (
                <ReservationRow
                  key={r.id}
                  reservation={r}
                  pending={pendingAction === r.id}
                  onArrived={() => setStatus(r.id, 'arrived')}
                  onNoShow={() => setStatus(r.id, 'no_show')}
                  onUndo={() => setStatus(r.id, 'confirmed')}
                  onAssign={() => setPickerFor(r)}
                />
              ))}
            </div>
            <p className="text-[11px] text-cayo-burgundy/40 text-center mt-3 font-bold">
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
      <p className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-xl font-black mt-0.5 text-cayo-burgundy">{value}</p>
      <p className="text-[11px] font-bold text-cayo-burgundy/50 mt-0.5 leading-tight">
        {sub}
      </p>
    </div>
  )
}
