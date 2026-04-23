// Server gate for /staff/submit — any active employee with a valid staff
// cookie can submit their availability for the upcoming week. No extra
// role guard here: waiters, kitchen, bartenders and host/manager all
// submit the same way.
import { redirect } from 'next/navigation'
import { isHostRequest } from '@/lib/host-auth'
import SubmitForm from './SubmitForm'

export default function StaffSubmitPage() {
  if (!isHostRequest()) {
    redirect('/host/login')
  }
  return <SubmitForm />
}
