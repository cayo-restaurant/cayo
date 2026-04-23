// Server component — same cookie + role gate as /host. Only host/manager
// employees can see the marked-reservations list; other staff roles are
// redirected to /staff.
import { redirect } from 'next/navigation'
import { isHostRequest, hostSessionHasHostRole } from '@/lib/host-auth'
import MarkedDashboard from './MarkedDashboard'

export default async function HostMarkedPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  if (!(await hostSessionHasHostRole())) {
    redirect('/staff')
  }
  return <MarkedDashboard />
}
