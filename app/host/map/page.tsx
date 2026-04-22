// Hostess view of the live restaurant map.
//
// Reuses the existing AdminMapPage component — it already accepts a host
// session alongside admin, and hides edit/delete controls automatically
// when the viewer is host-only. This file is just the route gate: if
// there's no valid host cookie, bounce to /host/login; otherwise render
// the shared map.
import { redirect } from 'next/navigation'
import { isHostRequest } from '@/lib/host-auth'
import AdminMapPage from '../../admin/map/page'

export default function HostMapPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  return <AdminMapPage />
}
