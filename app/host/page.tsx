// Server component — checks the host cookie before rendering. Acts as a
// gatekeeper for the client-side dashboard.
import { redirect } from 'next/navigation'
import { isHostRequest } from '@/lib/host-auth'
import HostDashboard from './HostDashboard'

export default function HostPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  return <HostDashboard />
}
