import { NextResponse } from 'next/server'
import { getAdminPassword, setAdminCookie } from '@/lib/admin-auth'

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    if (!password || password !== getAdminPassword()) {
      return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401 })
    }
    const res = NextResponse.json({ success: true })
    setAdminCookie(res)
    return res
  } catch {
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 })
  }
}
