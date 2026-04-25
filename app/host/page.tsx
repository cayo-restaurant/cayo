// Server component — gatekeeper for the client-side hostess dashboard.
//
// Access rules (see lib/host-auth.canViewHostUI):
//   • Admins (NextAuth allowlist) pass through without a host cookie —
//     they're already authenticated via Google.
//   • Otherwise the visitor needs a valid host cookie AND the underlying
//     employee record must have role host or manager. Cookie-less staff
//     go to /host/login; wrong-role staff go to /staff (the rota +
//     shift-request landing).
import { redirect } from 'next/navigation'
import { canViewHostUI } from '@/lib/host-auth'
import HostDashboard from './HostDashboard'

export default async function HostPage() {
  const gate = await canViewHostUI()
  if (!gate.allow) redirect(gate.redirect)
  return <HostDashboard />
}
