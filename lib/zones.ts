// Zone capacity config loader.
//
// The venue's capacity numbers (bar stools, table seats, max bar party size)
// used to be env vars. They now live in the `zones` DB table so the owner can
// edit them without a redeploy. This module is the single entry point other
// server code uses to ask "what are the current capacity numbers?".
//
// Behaviour:
//   • getZoneConfig() queries the `zones` table and returns a plain object
//     with bar/table capacity + MAX_BAR_PARTY.
//   • Results are cached in-memory for a short TTL (see CACHE_TTL_MS) so a
//     single API request doesn't hit the DB twice, and bursty traffic
//     doesn't hammer it. An edit in the DB takes at most CACHE_TTL_MS to
//     propagate — acceptable for config that changes a few times a month.
//   • If the query fails or returns no rows, we fall back to the env-var
//     defaults (same numbers we used to ship). This keeps the app bootable
//     if the migration hasn't been run yet.
//
// The shape is intentionally narrow — just the two zones the booking flow
// actually uses. If a third zone is ever added, we widen this module and
// the `area` check constraint on reservations together.
import { getServiceClient } from '@/lib/supabase'

export interface ZoneConfig {
  bar: { capacity: number; maxPartySize: number }
  table: { capacity: number; maxPartySize: number | null }
}

// Fallback defaults used when the DB is unreachable or the zones table is
// empty (e.g. before the migration has been run in a fresh env). These match
// the real-world physical venue.
const FALLBACK_BAR_CAPACITY = Number(process.env.BAR_CAPACITY ?? 14)
const FALLBACK_TABLE_CAPACITY = Number(process.env.TABLE_CAPACITY ?? 44)
const FALLBACK_MAX_BAR_PARTY = Number(process.env.MAX_BAR_PARTY ?? 4)

export const FALLBACK_ZONE_CONFIG: ZoneConfig = {
  bar: { capacity: FALLBACK_BAR_CAPACITY, maxPartySize: FALLBACK_MAX_BAR_PARTY },
  table: { capacity: FALLBACK_TABLE_CAPACITY, maxPartySize: null },
}

// Cache TTL: 30s. Chosen so that a single request doesn't re-query, and a
// handful of near-simultaneous requests share one lookup, but config edits
// still propagate within half a minute without a server restart.
const CACHE_TTL_MS = 30_000

interface CacheEntry {
  value: ZoneConfig
  expiresAt: number
}

let cache: CacheEntry | null = null

// For tests: reset the in-memory cache so each test case gets a fresh load.
export function clearZoneConfigCache(): void {
  cache = null
}

interface ZoneRow {
  id: string
  capacity: number
  max_party_size: number | null
  active: boolean
}

// Fold raw DB rows into the structured ZoneConfig shape. Any row the app
// doesn't know about is ignored (forward-compat for new zones added in DB
// before the code learns about them).
function foldRows(rows: ZoneRow[]): ZoneConfig {
  const config: ZoneConfig = {
    bar: { ...FALLBACK_ZONE_CONFIG.bar },
    table: { ...FALLBACK_ZONE_CONFIG.table },
  }
  for (const row of rows) {
    if (!row.active) continue
    if (row.id === 'bar') {
      config.bar = {
        capacity: row.capacity,
        // Bar must have a per-reservation cap (guarded by the CHECK constraint
        // in practice, but we keep a fallback if someone NULLed it).
        maxPartySize: row.max_party_size ?? FALLBACK_MAX_BAR_PARTY,
      }
    } else if (row.id === 'table') {
      config.table = {
        capacity: row.capacity,
        maxPartySize: row.max_party_size, // null means "no per-reservation cap"
      }
    }
  }
  return config
}

export async function getZoneConfig(): Promise<ZoneConfig> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value

  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('zones')
      .select('id, capacity, max_party_size, active')
    if (error) throw error
    const rows = (data ?? []) as ZoneRow[]
    const value = rows.length > 0 ? foldRows(rows) : FALLBACK_ZONE_CONFIG
    cache = { value, expiresAt: now + CACHE_TTL_MS }
    return value
  } catch (err) {
    // DB unreachable or table missing — don't brick the app, just use the
    // compiled-in defaults. Log once so ops notices.
    // eslint-disable-next-line no-console
    console.error('[zones] failed to load zone config, using fallback:', err)
    return FALLBACK_ZONE_CONFIG
  }
}
