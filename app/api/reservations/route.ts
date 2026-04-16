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
import { shiftDayLocal } from '@/lib/shift-day'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendConfirmation } from '@/lib/resend'

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
const adminReservationSchema = z.object({
  name: z.string().trim().max(100).optional().default(''),
  date: z.string().min(1, 'נא לבחור יום'),
  time: z.string().refine(v => VALID_TIMES.includes(v), { message: 'שעה חייבת להיות בין 19:00 ל-22:00' }),
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
})

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

  const reservations = await listReservations()

  // Hostess-only session: restrict to today's shift only. This also prevents
  // a host-authenticated device from pulling the full customer history.
  if (host) {
    return NextResponse.json({ reservations: reservations.filter(r => r.date === today) })
  }

  return NextResponse.json({ reservations })
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

    // Capacity gate: reject if this reservation would overfill the chosen
    // area at the chosen time. Computed against the current DB state; there's
    // a small race window between check and insert, but for restaurant-scale
    // volumes that's acceptable (and admin can always cancel an overbooking).
    const existing = await listReservations()
    const capacityError = checkSlotAvailability(existing, {
      date: parsed.data.date,
      time: parsed.data.time,
      area: parsed.data.area,
      guests: parsed.data.guests,
    })
    if (capacityError) {
      return NextResponse.json({ error: capacityError }, { status: 409 })
    }

    // Backfill defaults so DB columns stay non-null for admin-created entries
    // where the hostess hasn't collected name/phone/email yet.
    const reservation = await createReservation({
      ...parsed.data,
      name: parsed.data.name || 'אורח/ת',
      phone: parsed.data.phone || '',
      email: parsed.data.email || '',
      terms: parsed.data.terms ?? true,
    })

    // Confirmation emails are temporarily disabled by request of the owner.
    // Previously we had a `sendConfirmation` call here guarded by `if (false && ...)`
    // — that dead-code guard trips TS control-flow narrowing under strict mode
    // (parsed.data is seen as possibly undefined inside the unreachable branch),
    // which broke the Vercel build. To re-enable confirmation emails, restore
    // the sendConfirmation block here using an env flag instead of `false &&`.
    void sendConfirmation

    return NextResponse.json({ success: true, id: reservation.id })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}
