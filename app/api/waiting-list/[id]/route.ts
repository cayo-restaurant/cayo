import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { isHostRequest } from '@/lib/host-auth'
import { removeFromWaitingList } from '@/lib/waiting-list-store'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await isAdminRequest()
  const host = !admin && isHostRequest()
  if (!admin && !host) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  try {
    const ok = await removeFromWaitingList(params.id)
    if (!ok) {
      return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}
