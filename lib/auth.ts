import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { getServerSession } from 'next-auth'

// Comma-separated list of Gmail / Google Workspace addresses allowed into /admin.
// Configure via ALLOWED_ADMIN_EMAILS env var.
function getAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_ADMIN_EMAILS || ''
  return raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    // Reject sign-in for emails not on the allowlist.
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase()
      if (!email) return false
      const allowed = getAllowedEmails()
      if (allowed.length === 0) {
        // Fail closed: if the env var isn't set, reject everyone rather than allowing any Google user in.
        return false
      }
      return allowed.includes(email)
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        token.email = profile.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string
      }
      return session
    },
  },
  pages: {
    signIn: '/admin',
    error: '/admin',
  },
}

// Server-side: returns true if the current request has a valid session
// AND that session's email is on the allowlist.
export async function isAdminRequest(): Promise<boolean> {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) return false
  return getAllowedEmails().includes(email)
}
