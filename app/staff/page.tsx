// Server component — gates /staff on a valid staff cookie, then renders
// the role-aware landing page on the client. This is the first screen a
// staff member sees after login (every role lands here; only host/manager
// can proceed to /host, only admins to /admin).
import { redirect } from 'next/navigation'
import { isHostRequest } from '@/lib/host-auth'
import StaffHome from './StaffHome'

export default function StaffPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  return <StaffHome />
}
