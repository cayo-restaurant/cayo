'use client'

// Management dashboard — dense operations layout.
//
// Visual language matches /admin and /host so staff don't context-switch
// between surfaces: white background, `border-2 border-cayo-burgundy/15
// rounded-xl` cards, uppercase tracking-wider labels, `font-black` numbers,
// teal accent for positive metrics, orange/red for warning/bad thresholds.
//
// Read-only — pulls everything from /api/admin/dashboard, which in turn calls
// the `get_dashboard_metrics(period_days)` RPC. All aggregation runs server
// side so bandwidth stays ≪2GB/mo regardless of history size.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

// ── Metric shapes (mirror the RPC payload) ───────────────────────────────
interface VolumeMetrics {
  total_bookings_period: number
  total_bookings_year: number
  total_guests_served: number
  avg_guests_per_booking: number
}
interface DowEntry { dow: number; bookings: number; guests: number }
interface HourEntry { time: string; bookings: number; guests: number }
interface AdvanceMetrics { avg_hours_ahead: number; median_hours_ahead: number }
interface ReturningMetrics {
  returning_count: number
  total_customers: number
  returning_rate: number
}
interface HeavyCustomer {
  phone: string
  name: string
  visits: number
  total_guests: number
}
interface Rates { cancellation_rate: number; no_show_rate: number }
interface Edits {
  status_changes: number
  guests_changes: number
  time_changes: number
  total_edits: number
}
interface Loyalty {
  avg_gap_days: number
  customers_with_multiple_visits: number
}

interface DashboardMetrics {
  period_days: number
  generated_at: string
  volume: VolumeMetrics
  day_of_week: DowEntry[] | null
  hour_distribution: HourEntry[] | null
  advance_booking: AdvanceMetrics
  returning_customers: ReturningMetrics
  heavy_customers: HeavyCustomer[] | null
  source_breakdown: Record<string, number> | null
  rates: Rates
  edits: Edits
  loyalty: Loyalty
}

const HEBREW_DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const SOURCE_LABEL: Record<string, string> = {
  customer: 'לקוח (אתר)',
  admin: 'מנהל',
  host: 'מארחת',
  unknown: 'לא ידוע',
}
const SOURCE_COLOR: Record<string, string> = {
  customer: 'bg-cayo-teal/80',
  admin: 'bg-cayo-burgundy/80',
  host: 'bg-cayo-orange/80',
  unknown: 'bg-cayo-burgundy/30',
}

const PERIOD_OPTIONS: { days: number; label: string }[] = [
  { days: 7, label: 'שבוע' },
  { days: 30, label: 'חודש' },
  { days: 90, label: '3 חודשים' },
  { days: 365, label: 'שנה' },
]

// ── Formatters ────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null, digits = 0): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—'
  return Number(n).toLocaleString('he-IL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtHoursAhead(hours: number | undefined | null): string {
  if (hours === undefined || hours === null || !Number.isFinite(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} דק'`
  if (hours < 24) return `${hours.toFixed(1)} שע׳`
  const days = Math.floor(hours / 24)
  const remHours = Math.round(hours - days * 24)
  if (remHours === 0) return `${days} ימים`
  return `${days} י׳ ${remHours} ש׳`
}

function fmtGap(days: number | undefined | null): string {
  if (days === undefined || days === null || !Number.isFinite(days)) return '—'
  if (days < 1) return 'פחות מיום'
  if (days < 30) return `${days.toFixed(1)} ימים`
  const months = days / 30
  if (months < 12) return `${months.toFixed(1)} חודשים`
  return `${(days / 365).toFixed(1)} שנים`
}

function fmtTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'לפני שניות'
  const min = Math.floor(sec / 60)
  if (min < 60) return `לפני ${min} דק׳`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `לפני ${hr} שע׳`
  return new Date(iso).toLocaleString('he-IL')
}

// ── Atoms ────────────────────────────────────────────────────────────────

type Tone = 'default' | 'good' | 'warn' | 'bad'

function toneText(tone: Tone): string {
  switch (tone) {
    case 'good': return 'text-cayo-teal'
    case 'warn': return 'text-cayo-orange'
    case 'bad': return 'text-cayo-red'
    default: return 'text-cayo-burgundy'
  }
}

function Tile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  tone?: Tone
}) {
  return (
    <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl px-3 py-2.5">
      <div className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-xl font-black leading-tight ${toneText(tone)}`}>{value}</div>
      {sub && (
        <div className="text-[10px] text-cayo-burgundy/50 font-bold mt-0.5 leading-tight">
          {sub}
        </div>
      )}
    </div>
  )
}

function Panel({
  title,
  action,
  children,
  padding = 'normal',
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  padding?: 'tight' | 'normal'
}) {
  return (
    <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl overflow-hidden">
      <header className="px-4 py-2.5 border-b border-cayo-burgundy/10 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-black text-cayo-burgundy uppercase tracking-wider">
          {title}
        </h3>
        {action && <div className="text-[10px] font-bold text-cayo-burgundy/60">{action}</div>}
      </header>
      <div className={padding === 'tight' ? 'p-3' : 'p-4'}>{children}</div>
    </div>
  )
}

function BarRow({
  label,
  value,
  max,
  valueLabel,
  color = 'teal',
}: {
  label: string
  value: number
  max: number
  valueLabel?: string
  color?: 'teal' | 'burgundy' | 'orange'
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const barCls =
    color === 'burgundy'
      ? 'bg-cayo-burgundy/70'
      : color === 'orange'
      ? 'bg-cayo-orange/70'
      : 'bg-cayo-teal/70'
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="w-12 text-[11px] font-bold text-cayo-burgundy/70 shrink-0">{label}</div>
      <div className="flex-1 h-3.5 bg-cayo-burgundy/5 rounded overflow-hidden">
        <div
          className={`h-full ${barCls} transition-[width] duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="min-w-[5.5rem] text-[11px] font-black text-cayo-burgundy text-end shrink-0">
        {valueLabel ?? fmt(value)}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { status } = useSession()
  const [period, setPeriod] = useState(30)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/admin/dashboard?period=${period}`)
        const data = await res.json()
        if (!res.ok) {
          if (!cancelled) setError(data.error || 'שגיאה בטעינת הדשבורד')
          return
        }
        if (!cancelled) setMetrics(data.metrics)
      } catch {
        if (!cancelled) setError('שגיאה בחיבור לשרת')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [period, status])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-cayo-burgundy font-black">טוען...</div>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-cayo-burgundy/70 font-bold mb-4">נדרשת כניסה עם חשבון מנהל</p>
          <Link href="/admin" className="text-cayo-burgundy underline font-black">
            חזרה לעמוד הניהול
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white pb-16" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5">
        <header className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-cayo-burgundy">
              דשבורד הזמנות
            </h1>
            {metrics && (
              <span className="text-[10px] font-bold text-cayo-burgundy/50 uppercase tracking-wider">
                עודכן {fmtTimeAgo(metrics.generated_at)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div
              className="inline-flex rounded-lg border-2 border-cayo-burgundy/15 overflow-hidden bg-white"
              role="tablist"
              aria-label="טווח זמן"
            >
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  role="tab"
                  aria-selected={period === opt.days}
                  onClick={() => setPeriod(opt.days)}
                  className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors active:scale-[0.98] ${
                    period === opt.days
                      ? 'bg-cayo-burgundy text-white'
                      : 'text-cayo-burgundy hover:bg-cayo-burgundy/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {loading && (
          <div className="bg-white border-2 border-cayo-burgundy/15 rounded-xl p-10 text-center">
            <div className="text-cayo-burgundy/60 font-bold text-sm">טוען נתונים...</div>
          </div>
        )}
        {error && !loading && (
          <div className="bg-cayo-red/10 border-2 border-cayo-red/30 rounded-xl p-5 text-cayo-red font-bold text-sm">
            {error}
          </div>
        )}

        {metrics && !loading && !error && (() => {
          const dow = metrics.day_of_week ?? []
          const filledDow = HEBREW_DOW.map((label, idx) => {
            const row = dow.find(d => d.dow === idx)
            return { label, bookings: row?.bookings ?? 0, guests: row?.guests ?? 0 }
          })
          const maxDowGuests = Math.max(1, ...filledDow.map(f => f.guests))
          const busiestDow = filledDow.reduce(
            (best, cur) => (cur.guests > best.guests ? cur : best),
            filledDow[0],
          )

          const hours = metrics.hour_distribution ?? []
          const maxHourGuests = Math.max(1, ...hours.map(h => h.guests))
          const peakHour = hours.length
            ? hours.reduce(
                (best, cur) => (cur.guests > best.guests ? cur : best),
                hours[0],
              )
            : null

          const sourceEntries = Object.entries(metrics.source_breakdown ?? {})
          const sourceTotal = sourceEntries.reduce((s, [, v]) => s + (v as number), 0)
          const sortedSources = sourceEntries.sort(
            (a, b) => (b[1] as number) - (a[1] as number),
          )

          const heavy = metrics.heavy_customers ?? []

          const cancelTone: Tone =
            (metrics.rates?.cancellation_rate ?? 0) > 20
              ? 'bad'
              : (metrics.rates?.cancellation_rate ?? 0) > 10
              ? 'warn'
              : 'good'
          const noShowTone: Tone =
            (metrics.rates?.no_show_rate ?? 0) > 15
              ? 'bad'
              : (metrics.rates?.no_show_rate ?? 0) > 5
              ? 'warn'
              : 'good'

          return (
            <>
              {/* Hero KPI strip: 6 tiles wide on desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <Tile
                  label="הזמנות בתקופה"
                  value={fmt(metrics.volume?.total_bookings_period)}
                  sub={`${period} ימים אחרונים`}
                />
                <Tile
                  label="הזמנות שנה"
                  value={fmt(metrics.volume?.total_bookings_year)}
                  sub="12 חודשים אחרונים"
                />
                <Tile
                  label="סועדים שהוגש"
                  value={fmt(metrics.volume?.total_guests_served)}
                  sub="הוגש / אושר"
                  tone="good"
                />
                <Tile
                  label="ממוצע סועדים"
                  value={fmt(metrics.volume?.avg_guests_per_booking, 1)}
                  sub="להזמנה"
                />
                <Tile
                  label="% ביטולים"
                  value={`${fmt(metrics.rates?.cancellation_rate, 1)}%`}
                  tone={cancelTone}
                />
                <Tile
                  label="% אי-הגעה"
                  value={`${fmt(metrics.rates?.no_show_rate, 1)}%`}
                  tone={noShowTone}
                />
              </div>

              {/* Row: day-of-week + hour distributions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                <Panel
                  title="עומס לפי ימי שבוע"
                  action={
                    <span className="text-cayo-teal font-black">
                      שיא: {busiestDow.label} · {fmt(busiestDow.guests)} סועדים
                    </span>
                  }
                >
                  <div className="space-y-0.5">
                    {filledDow.map(f => (
                      <BarRow
                        key={f.label}
                        label={f.label}
                        value={f.guests}
                        max={maxDowGuests}
                        valueLabel={`${fmt(f.guests)} · ${f.bookings} הז׳`}
                      />
                    ))}
                  </div>
                </Panel>

                <Panel
                  title="עומס לפי שעות"
                  action={
                    peakHour && (
                      <span className="text-cayo-teal font-black">
                        שיא: {peakHour.time} · {fmt(peakHour.guests)} סועדים
                      </span>
                    )
                  }
                >
                  {hours.length === 0 ? (
                    <div className="text-xs text-cayo-burgundy/50 font-bold py-3">
                      אין נתונים לתקופה
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {hours.map(h => (
                        <BarRow
                          key={h.time}
                          label={h.time}
                          value={h.guests}
                          max={maxHourGuests}
                          valueLabel={`${fmt(h.guests)} · ${h.bookings} הז׳`}
                        />
                      ))}
                    </div>
                  )}
                </Panel>
              </div>

              {/* Row: sources + advance booking + loyalty */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <Panel title="מקורות הזנה">
                  {sourceEntries.length === 0 ? (
                    <div className="text-xs text-cayo-burgundy/50 font-bold py-3">
                      אין נתונים
                    </div>
                  ) : (
                    <>
                      <div className="h-3 rounded overflow-hidden flex bg-cayo-burgundy/5 mb-3">
                        {sortedSources.map(([key, value]) => {
                          const pct = ((value as number) / sourceTotal) * 100
                          return (
                            <div
                              key={key}
                              className={SOURCE_COLOR[key] ?? 'bg-cayo-burgundy/30'}
                              style={{ width: `${pct}%` }}
                              title={`${SOURCE_LABEL[key] ?? key} · ${fmt(value as number)}`}
                            />
                          )
                        })}
                      </div>
                      <div className="space-y-1">
                        {sortedSources.map(([key, value]) => {
                          const pct = (((value as number) / sourceTotal) * 100).toFixed(0)
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between text-[11px] py-0.5"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-block w-2.5 h-2.5 rounded-sm ${
                                    SOURCE_COLOR[key] ?? 'bg-cayo-burgundy/30'
                                  }`}
                                />
                                <span className="font-bold text-cayo-burgundy/75">
                                  {SOURCE_LABEL[key] ?? key}
                                </span>
                              </div>
                              <div className="font-black text-cayo-burgundy">
                                {fmt(value as number)}{' '}
                                <span className="text-cayo-burgundy/50 font-bold">
                                  ({pct}%)
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </Panel>

                <Panel title="הזמנה מראש">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider mb-1">
                        ממוצע
                      </div>
                      <div className="text-xl font-black text-cayo-burgundy leading-tight">
                        {fmtHoursAhead(metrics.advance_booking?.avg_hours_ahead)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider mb-1">
                        חציון
                      </div>
                      <div className="text-xl font-black text-cayo-teal leading-tight">
                        {fmtHoursAhead(metrics.advance_booking?.median_hours_ahead)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-cayo-burgundy/50 font-bold mt-3 leading-snug">
                    מיצירת ההזמנה עד מועד ההגעה
                  </div>
                </Panel>

                <Panel title="נאמנות לקוחות">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider mb-1">
                        בין ביקורים
                      </div>
                      <div className="text-xl font-black text-cayo-burgundy leading-tight">
                        {fmtGap(metrics.loyalty?.avg_gap_days)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider mb-1">
                        לקוחות חוזרים
                      </div>
                      <div className="text-xl font-black text-cayo-teal leading-tight">
                        {fmt(metrics.loyalty?.customers_with_multiple_visits)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-cayo-burgundy/50 font-bold mt-3 leading-snug">
                    ממוצע בין כל 2 ביקורים עוקבים של אותו לקוח
                  </div>
                </Panel>
              </div>

              {/* Row: customer analysis + edits */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                <div className="flex flex-col gap-3">
                  <Panel title="חזרתיות לקוחות">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider mb-0.5">
                          ייחודיים
                        </div>
                        <div className="text-lg font-black text-cayo-burgundy leading-tight">
                          {fmt(metrics.returning_customers?.total_customers)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider mb-0.5">
                          חוזרים
                        </div>
                        <div className="text-lg font-black text-cayo-burgundy leading-tight">
                          {fmt(metrics.returning_customers?.returning_count)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-cayo-burgundy/75 uppercase tracking-wider mb-0.5">
                          שיעור
                        </div>
                        <div className="text-lg font-black text-cayo-teal leading-tight">
                          {fmt(metrics.returning_customers?.returning_rate, 1)}%
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-cayo-burgundy/50 font-bold mt-2 leading-snug">
                      לקוחות עם 2+ הזמנות שהוגשו / אושרו · לפי טלפון · כל ההיסטוריה
                    </div>
                  </Panel>

                  <Panel title="עריכות בתקופה">
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between py-1 border-b border-cayo-burgundy/10">
                        <span className="text-cayo-burgundy/70 font-bold">שינויי סטטוס</span>
                        <span className="font-black text-cayo-burgundy">
                          {fmt(metrics.edits?.status_changes)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-cayo-burgundy/10">
                        <span className="text-cayo-burgundy/70 font-bold">שינויי סועדים</span>
                        <span className="font-black text-cayo-burgundy">
                          {fmt(metrics.edits?.guests_changes)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-cayo-burgundy/10">
                        <span className="text-cayo-burgundy/70 font-bold">שינויי תאריך/שעה</span>
                        <span className="font-black text-cayo-burgundy">
                          {fmt(metrics.edits?.time_changes)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-cayo-burgundy font-black uppercase tracking-wider text-[10px]">
                          סה״כ
                        </span>
                        <span className="font-black text-cayo-teal text-sm">
                          {fmt(metrics.edits?.total_edits)}
                        </span>
                      </div>
                    </div>
                  </Panel>
                </div>

                <div className="lg:col-span-2">
                  <Panel
                    title="TOP 10 לקוחות כבדים"
                    action={<span>לפי סה״כ סועדים · כל ההיסטוריה</span>}
                    padding="tight"
                  >
                    {heavy.length === 0 ? (
                      <div className="text-xs text-cayo-burgundy/50 font-bold py-4 px-1">
                        אין עדיין לקוחות חוזרים
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-cayo-burgundy/60 font-black uppercase tracking-wider text-[10px]">
                              <th className="text-start py-2 pl-2 w-8">#</th>
                              <th className="text-start py-2">שם</th>
                              <th className="text-start py-2">טלפון</th>
                              <th className="text-end py-2">ביקורים</th>
                              <th className="text-end py-2 pl-2">סועדים</th>
                            </tr>
                          </thead>
                          <tbody>
                            {heavy.map((c, i) => (
                              <tr
                                key={c.phone}
                                className="border-t border-cayo-burgundy/10"
                              >
                                <td className="py-1.5 pl-2 text-cayo-burgundy/50 font-bold">
                                  {i + 1}
                                </td>
                                <td className="py-1.5 font-black text-cayo-burgundy">
                                  {c.name || '—'}
                                </td>
                                <td className="py-1.5 text-cayo-burgundy/70 font-bold">
                                  {c.phone}
                                </td>
                                <td className="py-1.5 text-end font-bold text-cayo-burgundy">
                                  {c.visits}
                                </td>
                                <td className="py-1.5 pl-2 text-end font-black text-cayo-teal">
                                  {fmt(c.total_guests)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                </div>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
