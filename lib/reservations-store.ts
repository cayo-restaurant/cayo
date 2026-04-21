import crypto from 'crypto'
import { getServiceClient } from './supabase'
import {
  getAssignmentsByReservationIds,
  type AssignedTable,
} from './assignments-store'

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'arrived'
  | 'no_show'
  | 'completed'
export type ReservationArea = 'bar' | 'table'
// Who initiated a reservation. 'unknown' covers rows that predate the
// source column (backfilled default).
export type ReservationSource = 'customer' | 'admin' | 'host' | 'unknown'
// Who performed an audit-log action. 'system' is reserved for background
// sweeps (e.g. auto no_show on stale confirmed).
export type ReservationActor = ReservationSource | 'system'

export interface Reservation {
  id: string
  name: string
  date: string
  time: string
  area: ReservationArea
  guests: number
  phone: string
  email: string
  terms: boolean
  status: ReservationStatus
  notes?: string
  internalNotes?: string
  createdAt: string
  updatedAt: string
  // Who created this reservation. 'unknown' for rows that predate the
  // source column.
  source: ReservationSource
  // Populated by listReservations/getReservation. May be empty if
  // the hostess hasn't assigned a physical table yet.
  tables: AssignedTable[]
}

// ── DB row shape (snake_case) ──
interface Row {
  id: string
  name: string
  date: string
  time: string
  area: ReservationArea
  guests: number
  phone: string
  email: string
  terms: boolean
  status: ReservationStatus
  notes: string | null
  internal_notes: string | null
  source: ReservationSource | null
  created_at: string
  updated_at: string
}

function rowToReservation(row: Row, tables: AssignedTable[] = []): Reservation {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    time: row.time,
    area: row.area,
    guests: row.guests,
    phone: row.phone,
    email: row.email,
    terms: row.terms,
    status: row.status,
    notes: row.notes ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source ?? 'unknown',
    tables,
  }
}

const TABLE = 'reservations'

export async function listReservations(): Promise<Reservation[]> {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .order('date', { ascending: true })
    .order('time', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []
  const assignments = await getAssignmentsByReservationIds(rows.map(r => r.id))
  return rows.map(r => rowToReservation(r, assignments.get(r.id) ?? []))
}

export async function getReservation(id: string): Promise<Reservation | null> {
  const sb = getServiceClient()
  const { data, error } = await sb.from(TABLE).select('*').eq('id', id).single()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw error
  }
  if (!data) return null
  const assignments = await getAssignmentsByReservationIds([id])
  return rowToReservation(data as Row, assignments.get(id) ?? [])
}

export async function createReservation(
  data: Omit<Reservation, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'tables' | 'source'> & { source?: ReservationSource },
  opts: { actor?: ReservationActor } = {}
): Promise<Reservation> {
  const sb = getServiceClient()
  const now = new Date().toISOString()
  const insertRow = {
    id: crypto.randomUUID(),
    name: data.name,
    date: data.date,
    time: data.time,
    area: data.area,
    guests: data.guests,
    phone: data.phone,
    email: data.email,
    terms: data.terms,
    status: 'pending' as ReservationStatus,
    notes: data.notes ?? null,
    source: data.source ?? 'unknown',
    created_at: now,
    updated_at: now,
  }
  const { data: inserted, error } = await sb
    .from(TABLE)
    .insert(insertRow)
    .select('*')
    .single()
  if (error) throw error
  // Fire-and-forget audit event. Failures are swallowed inside the logger
  // so we never break reservation creation on audit-log issues.
  void logReservationEvent({
    reservationId: (inserted as Row).id,
    eventType: 'created',
    actor: opts.actor ?? (data.source ?? 'unknown'),
    newValue: {
      name: data.name,
      date: data.date,
      time: data.time,
      area: data.area,
      guests: data.guests,
    },
  })
  // New reservations have no assignments yet.
  return rowToReservation(inserted as Row, [])
}

export interface UpdateOptions {
  // For optimistic locking: if provided, the update only succeeds if the
  // current updated_at matches this value. On mismatch, returns null to signal
  // a 409 conflict.
  expectedUpdatedAt?: string
}

export async function updateReservation(
  id: string,
  patch: Partial<Omit<Reservation, 'id' | 'createdAt' | 'tables'>>,
  opts: UpdateOptions = {}
): Promise<Reservation | null> {
  const sb = getServiceClient()
  const patchRow: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (patch.name !== undefined) patchRow.name = patch.name
  if (patch.date !== undefined) patchRow.date = patch.date
  if (patch.time !== undefined) patchRow.time = patch.time
  if (patch.area !== undefined) patchRow.area = patch.area
  if (patch.guests !== undefined) patchRow.guests = patch.guests
  if (patch.phone !== undefined) patchRow.phone = patch.phone
  if (patch.email !== undefined) patchRow.email = patch.email
  if (patch.terms !== undefined) patchRow.terms = patch.terms
  if (patch.status !== undefined) patchRow.status = patch.status
  if (patch.notes !== undefined) patchRow.notes = patch.notes || null
  if (patch.internalNotes !== undefined) patchRow.internal_notes = patch.internalNotes || null
  if (patch.source !== undefined) patchRow.source = patch.source

  let query = sb
    .from(TABLE)
    .update(patchRow)
    .eq('id', id)

  // Apply optimistic lock if expectedUpdatedAt is provided
  if (opts.expectedUpdatedAt !== undefined) {
    query = query.eq('updated_at', opts.expectedUpdatedAt)
  }

  const { data, error } = await query.select('*').single()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw error
  }
  if (!data) return null
  // Preserve existing assignments on patch — re-fetch so callers receive
  // the authoritative list.
  const assignments = await getAssignmentsByReservationIds([id])
  return rowToReservation(data as Row, assignments.get(id) ?? [])
}

// Auto-close the books on a previous shift day. Any reservation whose
// scheduled date is strictly before `beforeDate` and which is still in
// `confirmed` state clearly wasn't marked by the hostess before the
// shift-day cutoff (04:00 the next morning), so we record it as `no_show`
// for stats. Idempotent — if nothing matches, no write happens.
// Pending reservations are intentionally NOT touched: those still need an
// owner decision.
export async function markStaleConfirmedAsNoShow(beforeDate: string): Promise<number> {
  const sb = getServiceClient()
  // Narrow the window: only update reservations from the previous shift day.
  // Compute the cutoff: we want reservations with date >= (beforeDate - 1 day) and < beforeDate
  const prevDay = new Date(beforeDate)
  prevDay.setDate(prevDay.getDate() - 1)
  const prevDayStr = prevDay.toISOString().split('T')[0]

  const { data, error } = await sb
    .from(TABLE)
    .update({ status: 'no_show' as ReservationStatus, updated_at: new Date().toISOString() })
    .eq('status', 'confirmed')
    .gte('date', prevDayStr)
    .lt('date', beforeDate)
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

export async function deleteReservation(id: string): Promise<boolean> {
  const sb = getServiceClient()
  const { error, count } = await sb
    .from(TABLE)
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) throw error
  return (count ?? 0) > 0
}

// ── Audit log ───────────────────────────────────────────────────────────────
// Append-only event log used to power the analytics dashboard. Write failures
// are logged but never thrown — audit gaps are preferable to broken writes.
export interface ReservationEventInput {
  reservationId: string
  eventType: string
  actor: ReservationActor
  oldValue?: unknown
  newValue?: unknown
}

export async function logReservationEvent(input: ReservationEventInput): Promise<void> {
  try {
    const sb = getServiceClient()
    const { error } = await sb.from('reservation_events').insert({
      reservation_id: input.reservationId,
      event_type: input.eventType,
      actor: input.actor,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
    })
    if (error) {
      console.error('[logReservationEvent] insert error:', error)
    }
  } catch (err) {
    console.error('[logReservationEvent] unexpected:', err)
  }
}
