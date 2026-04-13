import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { status } = await request.json()

    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const { error } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}
