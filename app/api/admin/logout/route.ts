import { NextResponse } from 'next/server'
import { clearAdminCookie } from '@/lib/admin-auth'

export async function POST() {
  const res = NextResponse.json({ success: true })
  clearAdminCookie(res)
  return res
}
