import { NextResponse } from 'next/server'
import { clearHostCookieHeader } from '@/lib/host-auth'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.headers.set('Set-Cookie', clearHostCookieHeader())
  return res
}
