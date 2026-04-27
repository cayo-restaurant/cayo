'use client'

// Hostess's "already-marked" page. Shows today's arrived + no_show +
// completed reservations, so the main /host queue can stay focused on
// what still needs action. `completed` lands here when the hostess presses
// "פינו את השולחן" on the map after a guest has left. From here the hostess
// can tap a row to expand it and undo a wrong tap, which flips the status
// back to `confirmed`.
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import cayoLogo from '../../../cayo_brand_page_005.png'
import {
  AssignedTable,
  Enriched,
  HEBREW_DAYS,
  HEBREW_MONTHS,
  Reservation,
  ReservationDetailModal,
  ReservationRow,
  Status,
  enrich,
  shiftAdjustedDate,
  toDateString,
} from '../shared'
import { UndoToast, UndoToastState } from '../../../components/UndoToast'
import TablePickerModal from '../../admin/components/TablePickerModal'

export default function MarkedDashboard() {
  const router = useRouter()
  // Read ?day=N from the URL so this page mirrors whatever day the host
  // dashboard had selected when the user clicked "מסומנות". 0 = today.
  const searchParams = useSearchParams()
  const dayOffset = (() => {
    const v = searchParams?.get('day')
    if (!v) return 0
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : 0
  })()
  const [items, setItems] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState<number>(() => Date.now())
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null)
  // Arrived reservations can still be assigned a table here (the hostess
  // sometimes taps "הגיע" before deciding where to seat them).
  const [pickerFor, setPickerFor] = useState<Reservation | null>(null)
  const [editingReservation, setEditingReservation] = useState<Enriched | null>(null)

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
      // Honor the dayOffset from the URL — same shift-date math the host
      // dashboard uses, so /host?day=-1 → /host/marked?day=-1 shows the
      // same day's reservations on both pages.
      const baseShiftDate = shiftAdjustedDate(new Date())
      baseShiftDate.setDate(baseShiftDate.getDate() + dayOffset)
      const shiftDateStr = toDateString(baseShiftDate)
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
      // Skip refresh while the picker is open — same reasoning as HostDashboard.
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

  async function setStatus(id: string, status: Status) {
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

  const enriched: Enriched[] = useMemo(() => enrich(items, now), [items, now])

  const byTimeAsc = (a: Enriched, b: Enriched) => a.time.localeCompare(b.time)

  const arrived = enriched.filter(r => r.bucket === 'arrived').sort(byTimeAsc)
  const noShow = enriched.filter(r => r.bucket === 'no_show').sort(byTimeAsc)
  const completed = enriched.filter(r => r.bucket === 'completed').sort(byTimeAsc)
  // Order: currently-seated (arrived) first — most likely to need action;
  // then completed (already left, kept around so the hostess can undo a
  // mis-clear); then no_show last.
  const marked: Enriched[] = [...arrived, ...completed, ...noShow]

  const shiftDate = shiftAdjustedDate(new Date(now))
  const selectedDate = new Date(shiftDate)
  selectedDate.setDate(selectedDate.getDate() + dayOffset)
  const todayLabel = `יום ${HEBREW_DAYS[selectedDate.getDay()]}, ${selectedDate.getDate()} ${HEBREW_MONTHS[selectedDate.getMonth()]}`

  return (
    <div className="min-h-screen bg-white pb-12">
      <header className="border-b-2 border-cayo-burgundy/10 bg-white sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[60px] overflow-hidden">
              <Image src={cayoLogo} alt="CAYO" className="w-full h-auto scale-[1.35]" priority />
            </div>
            <div>
              <h1 className="text-lg font-black text-cayo-burgundy leading-tight">מסומנות</h1>
              <p className="text-xs text-cayo-burgundy/60 leading-tight">{todayLabel}</p>
            </div>
          </div>
          <Link
            href={dayOffset === 0 ? '/host' : `/host?day=${dayOffset}`}
            className="text-sm font-bold text-cayo-burgundy/70 hover:text-cayo-burgundy px-3 py-1.5"
          >
            → חזרה
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-5">
        {error && (
          <div className="mb-4 bg-cayo-red/5 border-2 border-cayo-red/30 rounded-xl p-3 text-center text-sm font-bold text-cayo-red">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-16 font-bold">טוען...</p>
        ) : marked.length === 0 ? (
          <div className="py-16 text-center text-cayo-burgundy/40 font-bold border-2 border-dashed border-cayo-burgundy/20 rounded-2xl">
            {dayOffset === 0 ? 'עדיין לא סומנו הזמנות היום' : 'לא סומנו הזמנות בתאריך זה'}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {marked.map((r, idx) => {
                const prev = idx > 0 ? marked[idx - 1] : null
                const showHeader = !prev || prev.time !== r.time
                let sameTimeCount = 0
                if (showHeader) {
                  for (let j = idx; j < marked.length; j++) {
                    if (marked[j].time === r.time) sameTimeCount++
                    else break
                  }
                }
                return (
                  <div key={r.id} className="space-y-2">
                    {showHeader && (
                      <div className={`flex items-center gap-2 ${idx === 0 ? '' : 'pt-2'}`}>
                        <span className="text-xs font-black text-cayo-burgundy/60" dir="ltr">
                          {r.time}
                        </span>
                        <span className="text-[11px] font-bold text-cayo-burgundy/30">·</span>
                        <span className="text-[11px] font-bold text-cayo-burgundy/40">
                          {sameTimeCount} {sameTimeCount === 1 ? 'הזמנה' : 'הזמנות'}
                        </span>
                        <span className="flex-1 border-t border-cayo-burgundy/10 ms-1" />
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
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-cayo-burgundy/40 text-center mt-3 font-bold">
              הקישי להצגת פרטים · ביטול סימון מחזיר לרשימה הראשית
            </p>
          </>
        )}
      </main>
      <UndoToast state={undoToast} onClose={() => setUndoToast(null)} />
      {editingReservation && (
        <ReservationDetailModal
          reservation={editingReservation}
          onClose={() => setEditingReservation(null)}
          onSaved={(updates) => setItems(prev => prev.map(r => r.id === editingReservation.id ? { ...r, ...updates } : r))}
          onAssign={() => { setPickerFor(editingReservation); setEditingReservation(null) }}
          onUndo={() => setStatus(editingReservation.id, 'confirmed')}
        />
      )}
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
