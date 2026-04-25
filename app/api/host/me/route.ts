import { NextResponse } from 'next/server'
import { getHostEmployeeId } from '@/lib/host-auth'
import { isAdminRequest } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabase'

// GET /api/host/me — identifies the current viewer of the hostess UI.
// Used by HostDashboard to show "שלום, {full_name}" in the header.
//
// Two viewer types are supported:
//   1. A hostess with a valid host cookie — returns their employee row
//      (full_name, roles).
//   2. A signed-in admin (NextAuth allowlist) without a host cookie —
//      returns a synthetic "admin" identity so the dashboard can still
//      greet them. We don't have an employee row to surface, so we use
//      a fixed display name ("מנהל") and a sentinel id.
//
// The host-cookie path takes precedence: if both cookies happen to be
// present (e.g. an admin who also signed in via the phone form), the
// employee identity wins because that's the more specific signal of
// "who is on shift right now".
export async function GET() {
  const employeeId = getHostEmployeeId()
  if (employeeId) {
    const sb = getServiceClient()
    const { data, error } = await sb
      .from('employees')
      .select('id, full_name, roles, active')
      .eq('id', employeeId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'not_found' }, { status: 401 })
    }
    if (!data.active) {
      return NextResponse.json({ error: 'inactive' }, { status: 401 })
    }

    return NextResponse.json({
      id: data.id,
      full_name: data.full_name,
      roles: data.roles || [],
    })
  }

  // No host cookie — fall back to the admin session. canViewHostUI()
  // already let them onto the page, so /api/host/me returning a real
  // identity here is what the dashboard expects.
  if (await isAdminRequest()) {
    return NextResponse.json({
      id: 'admin',
      full_name: 'מנהל',
      roles: ['admin'],
    })
  }

  return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
}
