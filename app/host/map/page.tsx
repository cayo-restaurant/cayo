// Hostess view of the live restaurant map.
//
// Reuses the existing AdminMapPage component — it already accepts a host
// session alongside admin, and hides edit/delete controls automatically
// when the viewer is host-only. This file is just the route gate: if
// there's no valid host cookie, bounce to /host/login; if the session
// belongs to an employee without host/manager role, bounce to /staff
// (waiters / kitchen / bar etc. should not see the map).
import { redirect } from 'next/navigation'
import { isHostRequest, hostSessionHasHostRole } from '@/lib/host-auth'
import AdminMapPage from '../../admin/map/page'

export default async function HostMapPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  if (!(await hostSessionHasHostRole())) {
    redirect('/staff')
  }
  return <AdminMapPage />
}
