// Hostess view of the live restaurant map.
//
// Reuses the existing AdminMapPage component — it already accepts a host
// session alongside admin, and hides edit/delete controls automatically
// when the viewer is host-only. This file is just the route gate; the
// shared canViewHostUI() helper handles admin pass-through, host cookie
// validation, and role gating (waiters / kitchen / bar staff are bounced
// to /staff, which doesn't expose the floor map).
import { redirect } from 'next/navigation'
import { canViewHostUI } from '@/lib/host-auth'
import AdminMapPage from '../../admin/map/page'

export default async function HostMapPage() {
  const gate = await canViewHostUI()
  if (!gate.allow) redirect(gate.redirect)
  return <AdminMapPage />
}
