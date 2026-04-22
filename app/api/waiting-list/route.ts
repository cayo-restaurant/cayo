import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminRequest } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { listAllWaiting, listWaitingByDate, addToWaitingList } from '@/lib/waiting-list-store'
import { shiftDayLocal } from '@/lib/shift-day'

const addSchema = z.object({
  name: z.string().trim().max(100).optional().default(''),
  phone: z.string().trim().refine(v => v === '' || /^05[0-9]{8}$/.test(v), {
    message: 'מספר טלפון לא תקין',
  }).optional().default(''),
  guests: z.number().min(1).max(10),
  // Default 'table' preserves prior behavior for any client that hasn't
  // started sending area yet.
  area: z.enum(['bar', 'table']).optional().default('table'),
  requestedDate: z.string().min(1),
  requestedTime: z.string().min(1),
})

export async function GET() {
  const admin = await isAdminRequest()
  const host = !admin && isHostRequest()
  if (!admin && !host) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  try {
    // Hosts only see today; admins see everything pending
    if (host) {
      const today = shiftDayLocal()
      const entries = await listWaitingByDate(today)
      return NextResponse.json({ waitingList: entries })
    }
    const entries = await listAllWaiting()
    return NextResponse.json({ waitingList: entries })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const admin = await isAdminRequest()
  const host = !admin && isHostRequest()
  if (!admin && !host) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = addSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const entry = await addToWaitingList({
      name: parsed.data.name || 'אורח/ת',
      phone: parsed.data.phone || '',
      guests: parsed.data.guests,
      area: parsed.data.area,
      requestedDate: parsed.data.requestedDate,
      requestedTime: parsed.data.requestedTime,
    })

    return NextResponse.json({ success: true, entry })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}
