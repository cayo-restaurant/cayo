// Password hashing + phone normalization helpers.
//
// We intentionally keep this tiny. Hostess auth is phone + password only —
// no self-service reset, no "forgot password" flow, no per-user salt tuning.
// The admin sets a password directly in the employees form and that's it.
import bcrypt from 'bcryptjs'

const BCRYPT_COST = 10 // ~100ms on a modest server. Fine for login throughput.

// Minimum password length. Admin chooses the password so we don't need strict
// complexity rules — we just guard against empty or single-char values that
// could be set by accident.
export const MIN_PASSWORD_LENGTH = 4

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

// Strip everything except digits. Turns "+972-50 123 4567" into "972501234567"
// and "050-123-4567" into "0501234567". Callers should also run this on the
// phone stored in the employees table before comparing, so a manager who
// entered "050-123-4567" still matches a hostess typing "0501234567".
export function normalizePhone(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  // Israeli numbers: a leading 972 (international prefix without +) becomes 0.
  if (digits.startsWith('972') && digits.length >= 11) {
    return '0' + digits.slice(3)
  }
  return digits
}
