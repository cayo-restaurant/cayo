// Server component — checks the host cookie AND the employee's role
// before rendering. Acts as a gatekeeper for the client-side dashboard.
//
// Any active employee can hold a staff cookie, but the hostess dashboard
// is restricted to roles ∈ {host, manager}. Other roles (waiters,
// bartenders, kitchen, dishwashers) are bounced back to /staff so they
// can only see what's appropriate for them — the rota and the shift
// submission form.
import { redirect } from 'next/navigation'
import { isHostRequest, hostSessionHasHostRole } from '@/lib/host-auth'
import HostDashboard from './HostDashboard'

export default async function HostPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  if (!(await hostSessionHasHostRole())) {
    redirect('/staff')
  }
  return <HostDashboard />
}
