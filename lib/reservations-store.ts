import crypto from 'crypto'
import { getServiceClient } from './supabase'

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled'
export type ReservationArea = 'bar' | 'table'

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
  createdAt: string
  updatedAt: string
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
  created_at: string
  updated_at: string
}

function rowToReservation(row: Row): Reservation {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  return (data as Row[]).map(rowToReservation)
}

export async function getReservation(id: string): Promise<Reservation | null> {
  const sb = getServiceClient()
  const { data, error } = await sb.from(TABLE).select('*').eq('id', id).single()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw error
  }
  return data ? rowToReservation(data as Row) : null
}

export async function createReservation(
  data: Omit<Reservation, 'id' | 'status' | 'createdAt' | 'updatedAt'>
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
    created_at: now,
    updated_at: now,
  }
  const { data: inserted, error } = await sb
    .from(TABLE)
    .insert(insertRow)
    .select('*')
    .single()
  if (error) throw error
  return rowToReservation(inserted as Row)
}

export async function updateReservation(
  id: string,
  patch: Partial<Omit<Reservation, 'id' | 'createdAt'>>
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

  const { data, error } = await sb
    .from(TABLE)
    .update(patchRow)
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw error
  }
  return data ? rowToReservation(data as Row) : null
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
