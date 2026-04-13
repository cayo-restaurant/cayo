import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase'
import { sendConfirmation } from '@/lib/resend'

const reservationSchema = z.object({
  name: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  phone: z.string().regex(/^0[0-9]{9}$/, 'מספר טלפון לא תקין'),
  email: z.string().email('אימייל לא תקין').optional().or(z.literal('')),
  date: z.string().min(1, 'נא לבחור תאריך'),
  time: z.string().min(1, 'נא לבחור שעה'),
  guests: z.number().min(1).max(20),
  notes: z.string().optional(),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json({ error: 'נדרש תאריך' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('date', date)
      .order('time', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'שגיאה בטעינת הזמנות' }, { status: 500 })
    }

    return NextResponse.json({ reservations: data })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = reservationSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      )
    }

    const { name, phone, email, date, time, guests, notes } = parsed.data
    const supabase = getServiceClient()

    // Check capacity
    const { data: settings } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'max_guests_per_slot')
      .single()

    const maxGuests = settings ? parseInt(settings.value) : 30

    const { data: existing } = await supabase
      .from('reservations')
      .select('guests')
      .eq('date', date)
      .eq('time', time)
      .neq('status', 'cancelled')

    const totalGuests = (existing || []).reduce((sum, r) => sum + r.guests, 0)

    if (totalGuests + guests > maxGuests) {
      return NextResponse.json(
        { error: 'מצטערים, אין מספיק מקום בשעה זו. נסו שעה אחרת.' },
        { status: 409 }
      )
    }

    // Insert reservation
    const { error: insertError } = await supabase
      .from('reservations')
      .insert({ name, phone, email: email || null, date, time, guests, notes: notes || null })

    if (insertError) {
      return NextResponse.json(
        { error: 'שגיאה בשמירת ההזמנה' },
        { status: 500 }
      )
    }

    // Send confirmation email
    if (email) {
      try {
        await sendConfirmation({ email, name, date, time, guests })
      } catch {
        // Email failure shouldn't block the reservation
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: 'שגיאה בלתי צפויה' },
      { status: 500 }
    )
  }
}
