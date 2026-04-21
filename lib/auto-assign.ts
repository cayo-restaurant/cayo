// Auto-table assignment logic.
//
// Given the full list of active tables, all existing assignments for a given
// date, and the new reservation's parameters, returns the best table(s) to
// assign -- or an empty array if none are available (--> waiting list).
//
// Single-table path (most reservations):
//   Smallest capacity_max >= guests in the right area.
//
// Multi-table fallback (no single table fits):
//   1. Fixed link_group: ALL tables in the group must be free + combined
//      capacity >= guests. Pick the least-wasteful group.
//   2. Flexible combo_zone: find the shortest CONTIGUOUS run (no gaps in
//      table_number order) of 2-MAX_COMBO_TABLES free tables whose combined
//      capacity >= guests. Max 4 tables per reservation.
//   3. Bar: find `guests` CONSECUTIVE free seats (no number gaps). Max 3.
//
// A table is considered busy at time T if an existing reservation using that
// table has time T' where the two 2-hour windows overlap:
//   overlap <=> |T - T'| < RESERVATION_DURATION_MINUTES

import { RESERVATION_DURATION_MINUTES } from './capacity'
import { getServiceClient } from './supabase'

/** Maximum number of tables that can be combined in a combo_zone. */
const MAX_COMBO_TABLES = 4

export interface TableCandidate {
  id: string
  tableNumber: number
  capacityMin: number
  capacityMax: number
  area: string
  linkGroupId: string | null
  comboZone: number | null
}

export interface ExistingAssignment {
  tableId: string
  reservationTime: string   // HH:mm
  reservationDate: string   // YYYY-MM-DD
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function windowsOverlap(timeA: string, timeB: string): boolean {
  const duration = RESERVATION_DURATION_MINUTES
  const aMin = timeToMinutes(timeA)
  const bMin = timeToMinutes(timeB)
  return Math.abs(aMin - bMin) < duration
}

// -- Pure helpers -------------------------------------------------------------

/**
 * Bar-only: find `guests` consecutive free seats (no number gaps).
 */
function findConsecutiveBarSeats(
  freeSeats: TableCandidate[],
  guests: number,
): TableCandidate[] {
  if (freeSeats.length < guests) return []
  const sorted = [...freeSeats].sort((a, b) => a.tableNumber - b.tableNumber)
  for (let i = 0; i <= sorted.length - guests; i++) {
    const win = sorted.slice(i, i + guests)
    const ok = win.every(
      (seat, idx) => idx === 0 || seat.tableNumber === win[idx - 1].tableNumber + 1,
    )
    if (ok) return win
  }
  return []
}

/**
 * Fixed link_group: ALL tables in the group must be free and combined
 * capacity >= guests. Returns the least-wasteful group, or [].
 */
function findLinkedGroup(
  allAreaTables: TableCandidate[],
  freeIds: Set<string>,
  guests: number,
): TableCandidate[] {
  const groups = new Map<string, TableCandidate[]>()
  for (const t of allAreaTables) {
    if (!t.linkGroupId) continue
    if (!groups.has(t.linkGroupId)) groups.set(t.linkGroupId, [])
    groups.get(t.linkGroupId)!.push(t)
  }

  const valid: { tables: TableCandidate[]; totalCap: number }[] = []
  for (const [, groupTables] of groups) {
    const totalCap = groupTables.reduce((s, t) => s + t.capacityMax, 0)
    if (totalCap < guests) continue
    if (!groupTables.every(t => freeIds.has(t.id))) continue
    valid.push({ tables: groupTables, totalCap })
  }
  if (valid.length === 0) return []

  valid.sort((a, b) => {
    if (a.totalCap !== b.totalCap) return a.totalCap - b.totalCap
    const aMin = Math.min(...a.tables.map(t => t.tableNumber))
    const bMin = Math.min(...b.tables.map(t => t.tableNumber))
    return aMin - bMin
  })
  return valid[0].tables.sort((a, b) => a.tableNumber - b.tableNumber)
}

/**
 * Flexible combo_zone: tables in the same zone can be combined in any
 * contiguous run (by table_number, no gaps) of 2..MAX_COMBO_TABLES.
 * A busy table in the middle of a run breaks it -- you cannot skip it.
 * Returns the smallest valid run, or [].
 */
function findComboZone(
  allAreaTables: TableCandidate[],
  freeIds: Set<string>,
  guests: number,
): TableCandidate[] {
  // Group by combo_zone
  const zones = new Map<number, TableCandidate[]>()
  for (const t of allAreaTables) {
    if (t.comboZone === null) continue
    if (!zones.has(t.comboZone)) zones.set(t.comboZone, [])
    zones.get(t.comboZone)!.push(t)
  }

  const valid: { tables: TableCandidate[]; totalCap: number }[] = []

  for (const [, zoneTables] of zones) {
    // Sort ALL zone tables by number (busy ones included -- they break runs)
    const sorted = [...zoneTables].sort((a, b) => a.tableNumber - b.tableNumber)

    // Slide windows of size 2..MAX_COMBO_TABLES over the sorted list
    for (let size = 2; size <= Math.min(MAX_COMBO_TABLES, sorted.length); size++) {
      for (let i = 0; i <= sorted.length - size; i++) {
        const win = sorted.slice(i, i + size)
        // All must be free (a busy table in the run disqualifies the whole window)
        if (!win.every(t => freeIds.has(t.id))) continue
        const totalCap = win.reduce((s, t) => s + t.capacityMax, 0)
        if (totalCap < guests) continue
        valid.push({ tables: win, totalCap })
      }
    }
  }

  if (valid.length === 0) return []

  // Smallest combined capacity first, then earliest starting table
  valid.sort((a, b) => {
    if (a.totalCap !== b.totalCap) return a.totalCap - b.totalCap
    return a.tables[0].tableNumber - b.tables[0].tableNumber
  })
  return valid[0].tables
}

// -- Main pure function -------------------------------------------------------

/**
 * Pick the best table(s) for a new reservation.
 * Returns [] when the waiting list should be used instead.
 */
export function pickTables(
  tables: TableCandidate[],
  assignments: ExistingAssignment[],
  date: string,
  time: string,
  guests: number,
  area: string,
): TableCandidate[] {
  const busyTableIds = new Set<string>()
  for (const a of assignments) {
    if (a.reservationDate === date && windowsOverlap(time, a.reservationTime)) {
      busyTableIds.add(a.tableId)
    }
  }

  const areaTables = tables.filter(t => t.area === area)
  const freeTables = areaTables.filter(t => !busyTableIds.has(t.id))
  const freeIds = new Set(freeTables.map(t => t.id))

  // 1. Single-table fit
  const singleFit = freeTables
    .filter(t => t.capacityMax >= guests)
    .sort((a, b) =>
      a.capacityMax !== b.capacityMax
        ? a.capacityMax - b.capacityMax
        : a.tableNumber - b.tableNumber,
    )
  if (singleFit.length > 0) return [singleFit[0]]

  // 2. Multi-table fallback
  if (area === 'bar') {
    return findConsecutiveBarSeats(freeTables, guests)
  }

  const linked = findLinkedGroup(areaTables, freeIds, guests)
  if (linked.length > 0) return linked

  return findComboZone(areaTables, freeIds, guests)
}

/** Backward-compat alias. Prefer pickTables(). */
export function pickTable(
  tables: TableCandidate[],
  assignments: ExistingAssignment[],
  date: string,
  time: string,
  guests: number,
  area: string,
): TableCandidate | null {
  const result = pickTables(tables, assignments, date, time, guests, area)
  return result.length > 0 ? result[0] : null
}

// -- DB helpers ---------------------------------------------------------------

interface TableRow {
  id: string
  table_number: number
  area: string
  capacity_min: number
  capacity_max: number
  link_group_id: string | null
  combo_zone: number | null
}

interface JunctionRow {
  table_id: string
  reservation_id: string
}

interface ReservationRow {
  id: string
  date: string
  time: string
  status: string
}

const OCCUPYING = new Set(['pending', 'confirmed', 'arrived'])

/**
 * Load all data and return the best table(s), or [] for waiting list.
 */
export async function autoPickTables(
  date: string,
  time: string,
  guests: number,
  area: string,
  excludeReservationId?: string,
): Promise<TableCandidate[]> {
  const sb = getServiceClient()

  const { data: tableRows, error: tErr } = await sb
    .from('restaurant_tables')
    .select('id, table_number, area, capacity_min, capacity_max, link_group_id, combo_zone')
    .eq('active', true)
  if (tErr) throw tErr

  const tables: TableCandidate[] = ((tableRows ?? []) as TableRow[]).map(r => ({
    id: r.id,
    tableNumber: r.table_number,
    capacityMin: r.capacity_min,
    capacityMax: r.capacity_max,
    area: r.area,
    linkGroupId: r.link_group_id ?? null,
    comboZone: r.combo_zone ?? null,
  }))

  const { data: resvRows, error: rErr } = await sb
    .from('reservations')
    .select('id, date, time, status')
    .eq('date', date)
    .in('status', [...OCCUPYING])
  if (rErr) throw rErr

  const reservations = ((resvRows ?? []) as ReservationRow[]).filter(
    r => !excludeReservationId || r.id !== excludeReservationId,
  )

  if (reservations.length === 0) {
    return pickTables(tables, [], date, time, guests, area)
  }

  const reservationIds = reservations.map(r => r.id)
  const { data: junctionRows, error: jErr } = await sb
    .from('reservation_tables')
    .select('table_id, reservation_id')
    .in('reservation_id', reservationIds)
  if (jErr) throw jErr

  const resvMap = new Map<string, { date: string; time: string }>()
  for (const r of reservations) resvMap.set(r.id, { date: r.date, time: r.time })

  const assignments: ExistingAssignment[] = ((junctionRows ?? []) as JunctionRow[])
    .map(j => {
      const r = resvMap.get(j.reservation_id)
      if (!r) return null
      return { tableId: j.table_id, reservationTime: r.time, reservationDate: r.date }
    })
    .filter((a): a is ExistingAssignment => a !== null)

  return pickTables(tables, assignments, date, time, guests, area)
}

/** Backward-compat alias. Prefer autoPickTables(). */
export async function autoPickTable(
  date: string,
  time: string,
  guests: number,
  area: string,
  excludeReservationId?: string,
): Promise<TableCandidate | null> {
  const result = await autoPickTables(date, time, guests, area, excludeReservationId)
  return result.length > 0 ? result[0] : null
}

/**
 * Sweep all active reservations for a given date that have no table assigned
 * and auto-assign the best available table(s) to each (FIFO by time).
 */
export async function autoAssignUnassigned(date: string): Promise<number> {
  const sb = getServiceClient()

  const { data: resvRows, error: rErr } = await sb
    .from('reservations')
    .select('id, date, time, area, guests, status')
    .eq('date', date)
    .in('status', [...OCCUPYING])
    .order('time', { ascending: true })
  if (rErr) throw rErr
  const reservations = (resvRows ?? []) as (ReservationRow & { area: string; guests: number })[]
  if (reservations.length === 0) return 0

  const allIds = reservations.map(r => r.id)
  const { data: jRows, error: jErr } = await sb
    .from('reservation_tables')
    .select('reservation_id')
    .in('reservation_id', allIds)
  if (jErr) throw jErr
  const assigned = new Set(
    (jRows ?? []).map((j: { reservation_id: string }) => j.reservation_id),
  )

  const unassigned = reservations.filter(r => !assigned.has(r.id))
  if (unassigned.length === 0) return 0

  let count = 0
  for (const r of unassigned) {
    try {
      const bestTables = await autoPickTables(r.date, r.time, r.guests, r.area, r.id)
      if (bestTables.length > 0) {
        const { setAssignments } = await import('./assignments-store')
        await setAssignments(r.id, bestTables.map(t => t.id), bestTables[0].id)
        count++
      }
    } catch {
      // Non-fatal
    }
  }
  return count
}
