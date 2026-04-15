// Per-IP rate limiting for public endpoints. In-memory token bucket, good enough
// for single-region deployment. Pattern mirrors host-auth.ts.
// 
// Rate limit: 5 reservations per 10 minutes per IP

interface BucketState {
  tokens: number
  lastRefillMs: number
}

const TOKENS_PER_WINDOW = 5
const WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const buckets = new Map<string, BucketState>()

export function checkRateLimit(ip: string): { allowed: boolean; remainingMs: number } {
  const now = Date.now()
  let state = buckets.get(ip)

  if (!state) {
    state = { tokens: TOKENS_PER_WINDOW, lastRefillMs: now }
    buckets.set(ip, state)
    return { allowed: true, remainingMs: 0 }
  }

  // Refill tokens based on elapsed time
  const elapsed = now - state.lastRefillMs
  const tokensToAdd = Math.floor(elapsed / (WINDOW_MS / TOKENS_PER_WINDOW))
  if (tokensToAdd > 0) {
    state.tokens = Math.min(TOKENS_PER_WINDOW, state.tokens + tokensToAdd)
    state.lastRefillMs += tokensToAdd * (WINDOW_MS / TOKENS_PER_WINDOW)
  }

  if (state.tokens > 0) {
    state.tokens--
    return { allowed: true, remainingMs: 0 }
  }

  // Blocked — compute when the next token becomes available
  const timeUntilNextToken = WINDOW_MS / TOKENS_PER_WINDOW - (now - state.lastRefillMs)
  return { allowed: false, remainingMs: Math.max(1, Math.ceil(timeUntilNextToken)) }
}
