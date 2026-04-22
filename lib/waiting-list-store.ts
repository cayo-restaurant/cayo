// Server-side CRUD for the waiting_list table.
//
// Entries represent customers who tried to book when no matching table was
// free. They are served FIFO: when a table opens up, the oldest unassigned
// entry that fits the freed table is promoted to a full reservation.

import { getServiceClient } from './supabase'

export type WaitingArea = 'bar' | 'table'

export interface WaitingListEntry {
  id: string
  name: string
  phone: string
  guests: number
  area: WaitingArea
  requestedDate: string   // YYYY-MM-DD
  requestedTime: string   // HH:mm
  autoAssigned: boolean
  reservationId: string | null
  createdAt: string
  updatedAt: string
}

// ── DB row shape (snake_case) ──
interface Row {
  id: string
  name: string
  phone: string
  guests: number
  area: WaitingArea | null
  requested_date: string
  requested_time: string
  auto_assigned: boolean
  reservation_id: string | null
  created_at: string
  updated_at: string
}

function rowToEntry(row: Row): WaitingListEntry {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    guests: row.guests,
    // Defensive: default to 'table' if a legacy row predates the `area`
    // column. The migration sets a NOT NULL default, so this branch is just
    // belt-and-braces.
    area: (row.area ?? 'table') as WaitingArea,
    requestedDate: row.requested_date,
    requestedTime: row.requested_time,
    autoAssigned: row.auto_assigned,
    reservationId: row.reservation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const TABLE = 'waiting_list'

/** List all waiting-list entries for a given date, ordered FIFO (oldest first). */
export async function listWaitingByDate(date: string): Promise<WaitingListEntry[]> {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('requested_date', date)
    .eq('auto_assigned', false)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Row[]).map(rowToEntry)
}

/** List ALL waiting-list entries (for admin view), ordered by date then created_at. */
export async function listAllWaiting(): Promise<WaitingListEntry[]> {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('auto_assigned', false)
    .order('requested_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Row[]).map(rowToEntry)
}

/** Add a new entry to the waiting list. */
export async function addToWaitingList(entry: {
  name: string
  phone: string
  guests: number
  area?: WaitingArea
  requestedDate: string
  requestedTime: string
}): Promise<WaitingListEntry> {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      name: entry.name,
      phone: entry.phone,
      guests: entry.guests,
      // Default 'table' matches the DB-side default; passing it explicitly
      // makes the intent clear in tests and audit logs.
      area: entry.area ?? 'table',
      requested_date: entry.requestedDate,
      requested_time: entry.requestedTime,
    })
    .select('*')
    .single()
  if (error) throw error
  return rowToEntry(data as Row)
}

/** Mark an entry as auto-assigned and link it to the created reservation. */
export async function markAssigned(
  entryId: string,
  reservationId: string
): Promise<void> {
  const sb = getServiceClient()
  const { error } = await sb
    .from(TABLE)
    .update({ auto_assigned: true, reservation_id: reservationId })
    .eq('id', entryId)
  if (error) throw error
}

/** Remove an entry manually (admin action). */
export async function removeFromWaitingList(id: string): Promise<boolean> {
  const sb = getServiceClient()
  const { error, count } = await sb
    .from(TABLE)
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) throw error
  return (count ?? 0) > 0
}

/**
 * Find the oldest pending waiting-list entry for a given date that fits
 * a table with the given capacity.
 *
 * Called when a table is freed to check if someone on the waiting list
 * can be promoted.
 */
export async function findNextWaiting(
  date: string,
  tableCapacityMax: number
): Promise<WaitingListEntry | null> {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('requested_date', date)
    .eq('auto_assigned', false)
    .lte('guests', tableCapacityMax)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return rowToEntry(data as Row)
}
