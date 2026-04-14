// Server component — same cookie gate as /host.
import { redirect } from 'next/navigation'
import { isHostRequest } from '@/lib/host-auth'
import MarkedDashboard from './MarkedDashboard'

export default function HostMarkedPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  return <MarkedDashboard />
}
