// Server-side CRUD for the reservation_tables junction.
//
// A "reservation" can be seated at one or more tables. Exactly one
// assignment per reservation is marked `is_primary=true` (the "home"
// table the hostess greets the guest at). All others are secondary
// tables the party spreads onto when it's larger than a single table
// can fit.
//
// The junction layer is intentionally separate from reservations-store.ts
// so the reservation CRUD stays simple and so nothing in capacity math
// has to change. Availability is still computed off the aggregate pool
// (BAR_CAPACITY / TABLE_CAPACITY) — assignments are purely a hostess
// convenience.

import { getServiceClient } from './supabase'

export type Area = 'bar' | 'table'

export interface AssignedTable {
  id: string
  tableNumber: number
  label: string | null
  area: Area
  capacityMin: number
  capacityMax: number
  isPrimary: boolean
}

// ── DB row shapes (snake_case) ──
interface JunctionRow {
  reservation_id: string
  table_id: string
  is_primary: boolean
}

interface TableRow {
  id: string
  table_number: number
  label: string | null
  area: Area
  capacity_min: number
  capacity_max: number
  active: boolean
}

function tableRowToAssigned(row: TableRow, isPrimary: boolean): AssignedTable {
  return {
    id: row.id,
    tableNumber: row.table_number,
    label: row.label,
    area: row.area,
    capacityMin: row.capacity_min,
    capacityMax: row.capacity_max,
    isPrimary,
  }
}

const JUNCTION = 'reservation_tables'
const TABLES = 'restaurant_tables'

/**
 * Fetch assignments for many reservations in two queries (N+1-safe).
 * Returns a Map keyed by reservation_id → sorted AssignedTable[]
 * (primary first, then by table_number asc).
 *
 * Reservations with no assignment simply don't appear in the map;
 * callers should treat a missing key as an empty array.
 */
export async function getAssignmentsByReservationIds(
  reservationIds: string[]
): Promise<Map<string, AssignedTable[]>> {
  const out = new Map<string, AssignedTable[]>()
  if (reservationIds.length === 0) return out

  const sb = getServiceClient()

  const { data: junctionRows, error: jErr } = await sb
    .from(JUNCTION)
    .select('reservation_id, table_id, is_primary')
    .in('reservation_id', reservationIds)
  if (jErr) throw jErr
  const junctions = (junctionRows ?? []) as JunctionRow[]
  if (junctions.length === 0) return out

  const tableIds = Array.from(new Set(junctions.map(j => j.table_id)))
  const { data: tableRows, error: tErr } = await sb
    .from(TABLES)
    .select('id, table_number, label, area, capacity_min, capacity_max, active')
    .in('id', tableIds)
  if (tErr) throw tErr
  const tableById = new Map<string, TableRow>()
  for (const t of (tableRows ?? []) as TableRow[]) tableById.set(t.id, t)

  for (const j of junctions) {
    const t = tableById.get(j.table_id)
    if (!t) continue // orphan — should not happen due to FK, but defensive
    const list = out.get(j.reservation_id) ?? []
    list.push(tableRowToAssigned(t, j.is_primary))
    out.set(j.reservation_id, list)
  }

  // Sort each list: primary first, then by table_number
  for (const list of out.values()) {
    list.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.tableNumber - b.tableNumber
    })
  }

  return out
}

/**
 * Replace the full set of table assignments for a reservation.
 *
 * Note on concurrency: supabase-js doesn't expose multi-statement
 * transactions without an edge function, so we do delete-then-insert.
 * In the current product (single hostess per shift) this is fine.
 * A future multi-user phase should wrap this in a Postgres function
 * or an advisory-lock sequence.
 *
 * @param reservationId  reservation whose assignments we're replacing
 * @param tableIds       full new set of table UUIDs (may be empty)
 * @param primaryTableId which of `tableIds` is the primary (must be in the set
 *                       unless tableIds is empty)
 */
export async function setAssignments(
  reservationId: string,
  tableIds: string[],
  primaryTableId: string | null
): Promise<void> {
  const sb = getServiceClient()

  if (tableIds.length > 0) {
    if (!primaryTableId) {
      throw new Error('primaryTableId is required when assigning tables')
    }
    if (!tableIds.includes(primaryTableId)) {
      throw new Error('primaryTableId must be one of tableIds')
    }
  }

  // 1) Remove all existing assignments for this reservation.
  const { error: delErr } = await sb
    .from(JUNCTION)
    .delete()
    .eq('reservation_id', reservationId)
  if (delErr) throw delErr

  if (tableIds.length === 0) return

  // 2) Insert the new set.
  const rows = tableIds.map(tableId => ({
    reservation_id: reservationId,
    table_id: tableId,
    is_primary: tableId === primaryTableId,
  }))
  const { error: insErr } = await sb.from(JUNCTION).insert(rows)
  if (insErr) throw insErr
}

/** Remove every assignment for a reservation. Idempotent. */
export async function clearAssignments(reservationId: string): Promise<void> {
  const sb = getServiceClient()
  const { error } = await sb
    .from(JUNCTION)
    .delete()
    .eq('reservation_id', reservationId)
  if (error) throw error
}

/**
 * Load all active tables once, e.g. for the TablePickerModal.
 * Sorted by area then table_number so the hostess sees a stable list.
 */
export interface TableLite {
  id: string
  tableNumber: number
  label: string | null
  area: Area
  capacityMin: number
  capacityMax: number
}

export async function listActiveTables(): Promise<TableLite[]> {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from(TABLES)
    .select('id, table_number, label, area, capacity_min, capacity_max, active')
    .eq('active', true)
    .order('area', { ascending: true })
    .order('table_number', { ascending: true })
  if (error) throw error
  return ((data ?? []) as TableRow[]).map(r => ({
    id: r.id,
    tableNumber: r.table_number,
    label: r.label,
    area: r.area,
    capacityMin: r.capacity_min,
    capacityMax: r.capacity_max,
  }))
}
