// Server component for /host/login.
//
// Two-step:
//   1. If the visitor is already signed in as an admin (NextAuth
//      allowlist), they don't need a phone+password — admins can hop
//      into host mode directly from /admin. Redirect them to /host so
//      they don't have to look at a form they'd never need to fill.
//   2. Otherwise render the existing client-side login form (phone +
//      password for employee accounts).
//
// The actual form lives in HostLoginForm.tsx as a 'use client' component
// because it manages local state and calls /api/host/login.
import { redirect } from 'next/navigation'
import { isAdminRequest } from '@/lib/auth'
import HostLoginForm from './HostLoginForm'

export default async function HostLoginPage() {
  if (await isAdminRequest()) {
    redirect('/host')
  }
  return <HostLoginForm />
}
