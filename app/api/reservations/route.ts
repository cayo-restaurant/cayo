import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createReservation,
  listReservations,
  markStaleConfirmedAsNoShow,
} from '@/lib/reservations-store'
import { isAdminRequest } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { checkSlotAvailability, VALID_TIMES } from '@/lib/capacity'
import { getZoneConfig } from '@/lib/zones'
import { shiftDayLocal, isSameDayBookingClosed } from '@/lib/shift-day'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendConfirmation } from '@/lib/resend'
import { setAssignments } from '@/lib/assignments-store'
import { claimMatchingWaiting } from '@/lib/waiting-list-store'

const reservationSchema = z.object({
  name: z.string().min(2, 'נא להזין שם'),
  date: z.string().min(1, 'נא לבחור יום'),
  time: z.string().refine(v => VALID_TIMES.includes(v), { message: 'שעה חייבת להיות בין 19:00 ל-22:00' }),
  area: z.enum(['bar', 'table']),
  guests: z.number().min(1).max(10),
  phone: z.string().regex(/^05[0-9]{8}$/, 'מספר טלפון לא תקין'),
  email: z.string().email('אימייל לא תקין'),
  terms: z.literal(true),
  notes: z.string().max(500).optional(),
})

// Relaxed schema used when an admin creates a reservation manually (e.g. a
// walk-in or a phone booking). Contact details are optional — sometimes the
// hostess just needs to block a slot before she has the guest's details.
// Date / time / area / guests are still required because they're load-bearing
// for capacity math.
//
// Walk-ins (is_walk_in=true) relax the time validation further: a walk-in
// can arrive at any minute during the shift (e.g. 20:37), not just the
// 15-min booking slots. They also accept an explicit status (usually
// 'arrived') and an optional pre-picked table assignment so the hostess
// can seat them in a single click on the map.
const adminReservationSchema = z.object({
  name: z.string().trim().max(100).optional().default(''),
  date: z.string().min(1, 'נא לבחור יום'),
  time: z.string().refine(
    v => VALID_TIMES.includes(v) || /^([01]?\d|2[0-3]):[0-5]\d$/.test(v),
    { message: 'שעה לא תקינה' },
  ),
  area: z.enum(['bar', 'table']),
  guests: z.number().min(1).max(10),
  phone: z.string().trim().refine(v => v === '' || /^05[0-9]{8}$/.test(v), {
    message: 'מספר טלפון לא תקין',
  }).optional().default(''),
  email: z.string().trim().refine(v => v === '' || z.string().email().safeParse(v).success, {
    message: 'אימייל לא תקין',
  }).optional().default(''),
  terms: z.boolean().optional().default(true),
  notes: z.string().max(500).optional(),
  is_walk_in: z.boolean().optional().default(false),
  status: z
    .enum(['pending', 'confirmed', 'cancelled', 'arrived', 'no_show', 'completed'])
    .optional(),
  // When the hostess picks a specific table on the map (walk-in at a free
  // table, or a manual assignment override) she can pass the table id(s) here
  // to skip auto-assignment. First id in the list becomes the primary table.
  table_ids: z.array(z.string().uuid()).optional(),
}).refine(
  data => data.is_walk_in || VALID_TIMES.includes(data.time),
  { path: ['time'], message: 'שעה חייבת להיות בין 19:00 ל-22:00' },
)

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  // Prefer x-real-ip (Vercel), fallback to first IP in x-forwarded-for
  if (realIp) return realIp.split(',')[0].trim()
  if (xff) return xff.split(',')[0].trim()
  return 'unknown'
}

export async function GET() {
  const admin = await isAdminRequest()
  // Only fall back to a host cookie when the admin cookie isn't present, so
  // admin users don't lose access to the full dataset just because they also
  // happen to have a host cookie on the same device.
  const host = !admin && isHostRequest()

  if (!admin && !host) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  // Close the books on any previous shift day before we list. Any reservation
  // still `confirmed` on a past date never got marked arrived/no-show, so we
  // record it as `no_show` — both to free the active list for today's shift
  // and to keep stats honest. The sweep runs for admin GETs too so the
  // attendance numbers stay accurate for both surfaces.
  const today = shiftDayLocal()
  try {
    await markStaleConfirmedAsNoShow(today)
  } catch {
    // Non-fatal: if the sweep fails we still want to serve the list.
  }

  // Background auto-assignment sweep DISABLED. Previously this fire-and-
  // forget block scanned for unassigned reservations and pending waiting-list
  // entries on every GET and tried to auto-pick tables for them. The hostess
  // now owns all table assignment manually from the map, so this sweep is
  // intentionally removed. To restore: re-add a getServiceClient-based loop
  // calling promoteWaitingListForDate() and autoAssignUnassigned().

  const reservations = await listReservations()
  // Zone config (bar+table capacities + max bar party) is DB-backed and
  // may be edited live by the owner, so pull it fresh per request. The
  // loader caches in-memory for 30s so repeated hits during a page load
  // share a single DB query.
  const zones = await getZoneConfig()

  // Host sessions now receive the full dataset so the day picker in the
  // hostess dashboard can navigate past/future days. The client filters by
  // the selected shift date locally. (Previously we filtered to `today`
  // server-side, which broke the day picker.)
  return NextResponse.json({
    reservations,
    totalCapacity: zones.bar.capacity + zones.table.capacity,
    zoneConfig: zones,
  })
}

export async function POST(request: Request) {
  // Staff POSTs (admin via Google OAuth OR hostess via PIN cookie) bypass the
  // public rate limit and use a relaxed schema where contact fields are
  // optional — both surfaces need to be able to block a slot before the
  // guest's details are fully collected (walk-ins, phone bookings).
  const admin = await isAdminRequest()
  const host = isHostRequest()
  const staff = admin || host

  if (!staff) {
    // Rate limit: 5 reservations per 10 minutes per IP — public-only
    const ip = getClientIp(request)
    const rateCheck = checkRateLimit(ip)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'יותר מדי ניסיונות. אנא נסה שנית בעוד כמה דקות.' },
        { status: 429 }
      )
    }
  }

  try {
    const body = await request.json()
    const parsed = staff
      ? adminReservationSchema.safeParse(body)
      : reservationSchema.safeParse(body)

    // Debug log: surface which schema ran and what failed. Lets us diagnose
    // cases where the hostess/owner reports "missing details" errors on /admin
    // — usually means the admin cookie wasn't sent so we fell back to strict.
    console.log('[reservations POST]', {
      admin,
      host,
      staff,
      schema: staff ? 'adminReservationSchema' : 'reservationSchema',
      ok: parsed.success,
      bodyKeys: Object.keys(body || {}),
      issues: parsed.success ? null : parsed.error.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    })

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      const fieldPath = firstError.path.join('.')
      // Return the field name alongside the message so the client can show
      // a more helpful error ("name: נא להזין שם" vs just "נא להזין שם").
      return NextResponse.json(
        { error: firstError.message, field: fieldPath, admin, host, staff },
        { status: 400 },
      )
    }

    // Same-day cutoff: public customers can no longer book today after 19:00
    // Israel time — at that point the shift has started and the hostess owns
    // floor allocation. Staff (admin / host) bypass the gate: they explicitly
    // need to be able to create walk-ins and last-minute entries after 19:00.
    if (!staff && isSameDayBookingClosed(parsed.data.date)) {
      return NextResponse.json(
        {
          error: 'הזמנות לאותו יום נסגרו. נא לבחור תאריך אחר.',
          field: 'date',
        },
        { status: 409 },
      )
    }

    // Capacity gate: reject if this reservation would overfill the chosen
    // area at the chosen time. Computed against the current DB state; there's
    // a small race window between check and insert, but for restaurant-scale
    // volumes that's acceptable (and admin can always cancel an overbooking).
    const [existing, zones] = await Promise.all([
      listReservations(),
      getZoneConfig(),
    ])
    const capacityError = checkSlotAvailability(existing, {
      date: parsed.data.date,
      time: parsed.data.time,
      area: parsed.data.area,
      guests: parsed.data.guests,
    }, zones)
    if (capacityError) {
      return NextResponse.json({ error: capacityError }, { status: 409 })
    }

    // Tag the reservation with its origin so analytics can tell a
    // customer-driven booking apart from a walk-in / phone booking created
    // by staff.
    const source = admin ? 'admin' : host ? 'host' : 'customer'
    // Walk-ins (only possible from staff schemas) go in as `arrived` so they
    // show up on the map immediately and count against live capacity without
    // a second PATCH. Other flows fall back to the caller's chosen status,
    // and ultimately to `pending`.
    const isWalkIn = staff && 'is_walk_in' in parsed.data && parsed.data.is_walk_in === true
    const initialStatus =
      staff && 'status' in parsed.data && parsed.data.status
        ? parsed.data.status
        : isWalkIn
          ? 'arrived'
          : undefined
    // Backfill defaults so DB columns stay non-null for admin-created entries
    // where the hostess hasn't collected name/phone/email yet.
    const reservation = await createReservation({
      ...parsed.data,
      name: parsed.data.name || 'אורח/ת',
      phone: parsed.data.phone || '',
      email: parsed.data.email || '',
      terms: parsed.data.terms ?? true,
      source,
      isWalkIn,
      status: initialStatus,
    }, { actor: source })

    // Confirmation emails are temporarily disabled by request of the owner.
    // Previously we had a `sendConfirmation` call here guarded by `if (false && ...)`
    // — that dead-code guard trips TS control-flow narrowing under strict mode
    // (parsed.data is seen as possibly undefined inside the unreachable branch),
    // which broke the Vercel build. To re-enable confirmation emails, restore
    // the sendConfirmation block here using an env flag instead of `false &&`.
    void sendConfirmation

    // Claim any pending waitlist entry for the same guest + slot. Covers the
    // "customer was on the waitlist, then rebooked another way" gap — without
    // this, the old waitlist row would stay flagged pending forever. Runs BEFORE
    // auto-assign so that a failure here doesn't block the table assignment.
    try {
      await claimMatchingWaiting({
        name: reservation.name,
        phone: reservation.phone,
        date: reservation.date,
        time: reservation.time,
        reservationId: reservation.id,
      })
    } catch (claimErr) {
      console.error('[reservations POST] waitlist claim error:', claimErr)
    }

    // Table assignment. Automatic table assignment is DISABLED — every
    // reservation is left unassigned for the hostess to seat manually from
    // the map. The only path that still writes table assignments here is when
    // the caller (staff, via the admin schema) explicitly passes `table_ids`
    // — i.e. the hostess clicked a specific table on the map for a walk-in
    // or manual seating. Public bookings, walk-ins without an explicit table,
    // and regular admin bookings all flow through with no table assigned and
    // are NOT added to the waiting list.
    //
    // To restore auto-assignment, re-introduce the autoPickTables() call and
    // the addToWaitingList fallback here, and the background sweep in GET.
    let autoAssigned = false
    const addedToWaiting = false
    const explicitTableIds =
      staff && 'table_ids' in parsed.data && Array.isArray(parsed.data.table_ids)
        ? parsed.data.table_ids
        : []
    try {
      if (explicitTableIds.length > 0) {
        await setAssignments(reservation.id, explicitTableIds, explicitTableIds[0])
        autoAssigned = true
      }
    } catch (assignErr) {
      console.error('[reservations POST] explicit-assignment error:', assignErr)
    }

    return NextResponse.json({ success: true, id: reservation.id, autoAssigned, addedToWaiting })
  } catch {
    return NextResponse.json({ error: '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05dc\u05ea\u05d9 \u05e6\u05e4\u05d5\u05d9\u05d4' }, { status: 500 })
  }
}
