'use client'

// Hostess's "already-marked" page. Shows only today's arrived + no_show
// reservations, so the main /host queue can stay focused on what still needs
// action. From here the hostess can tap a row to expand it and undo a wrong
// tap, which flips the status back to `confirmed`.
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import cayoLogo from '../../../cayo_brand_page_005.png'
import {
  Enriched,
  HEBREW_DAYS,
  HEBREW_MONTHS,
  Reservation,
  ReservationRow,
  Status,
  computeShiftDateStr,
  enrich,
  shiftAdjustedDate,
} from '../shared'
import { UndoToast, UndoToastState } from '../../../components/UndoToast'

export default function MarkedDashboard() {
  const router = useRouter()
  const [items, setItems] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState<number>(() => Date.now())
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null)

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
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const marked: Enriched[] = [...arrived, ...noShow]

  const shiftDate = shiftAdjustedDate(new Date(now))
  const todayLabel = `יום ${HEBREW_DAYS[shiftDate.getDay()]}, ${shiftDate.getDate()} ${HEBREW_MONTHS[shiftDate.getMonth()]}`

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
            href="/host"
            className="text-sm font-bold text-cayo-burgundy/70 hover:text-cayo-burgundy px-3 py-1.5"
          >
            → חזרה
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-5">
        {/* Summary strip */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="bg-cayo-teal/5 border-2 border-cayo-teal/30 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-cayo-teal/80 uppercase tracking-wider">
              הגיעו
            </p>
            <p className="text-xl font-black mt-0.5 text-cayo-teal">
              {arrived.length}
            </p>
            <p className="text-[11px] font-bold text-cayo-teal/70 mt-0.5 leading-tight">
              הזמנות
            </p>
          </div>
          <div className="bg-black/[0.03] border-2 border-black/15 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-black/60 uppercase tracking-wider">
              לא הגיעו
            </p>
            <p className="text-xl font-black mt-0.5 text-black/70">
              {noShow.length}
            </p>
            <p className="text-[11px] font-bold text-black/50 mt-0.5 leading-tight">
              הזמנות
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-cayo-red/5 border-2 border-cayo-red/30 rounded-xl p-3 text-center text-sm font-bold text-cayo-red">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-cayo-burgundy/50 py-16 font-bold">טוען...</p>
        ) : marked.length === 0 ? (
          <div className="py-16 text-center text-cayo-burgundy/40 font-bold border-2 border-dashed border-cayo-burgundy/20 rounded-2xl">
            עדיין לא סומנו הזמנות היום
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {marked.map(r => (
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
            <p className="text-[11px] text-cayo-burgundy/40 text-center mt-3 font-bold">
              הקישי על הזמנה ואז &quot;ביטול סימון&quot; כדי להחזיר אותה לרשימה הראשית
            </p>
          </>
        )}
      </main>
      <UndoToast state={undoToast} onClose={() => setUndoToast(null)} />
    </div>
  )
}
