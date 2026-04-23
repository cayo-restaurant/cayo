// Server gate — requires a staff cookie. The actual grid is rendered
// client-side in StaffRota so week navigation is interactive without
// full page reloads.
import { redirect } from 'next/navigation'
import { isHostRequest } from '@/lib/host-auth'
import StaffRota from './StaffRota'

export default function StaffRotaPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  return <StaffRota />
}
