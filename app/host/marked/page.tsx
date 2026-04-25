// Server component — same gate as /host: admins pass through, host
// cookies with role host/manager pass through, everyone else is sent
// to /host/login or /staff. See lib/host-auth.canViewHostUI for the
// full decision tree.
import { redirect } from 'next/navigation'
import { canViewHostUI } from '@/lib/host-auth'
import MarkedDashboard from './MarkedDashboard'

export default async function HostMarkedPage() {
  const gate = await canViewHostUI()
  if (!gate.allow) redirect(gate.redirect)
  return <MarkedDashboard />
}
