import { NextResponse } from 'next/server'
import { getHostEmployeeId } from '@/lib/host-auth'
import { getServiceClient } from '@/lib/supabase'

// GET /api/host/me — returns the currently logged-in hostess.
// Used by HostDashboard to show "שלום, {full_name}" in the header.
export async function GET() {
  const employeeId = getHostEmployeeId()
  if (!employeeId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

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
