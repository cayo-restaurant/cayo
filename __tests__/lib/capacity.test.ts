import { describe, it, expect } from 'vitest'
import {
  computeAvailability,
  checkSlotAvailability,
  computeFloorCapacityAt,
  DEFAULT_FLOOR_BUCKETS,
  FloorTable,
  ReservationLike,
} from '@/lib/capacity'
import type { ZoneConfig } from '@/lib/zones'

// Test fixture matching the real venue defaults (bar: 14 / max party 4,
// table: 44 / no per-reservation cap). Kept here instead of importing the
// fallback from lib/zones so the test isn't coupled to fallback-constant
// changes — the fixture is the unit under test.
const ZONES: ZoneConfig = {
  bar: { capacity: 14, maxPartySize: 4 },
  table: { capacity: 44, maxPartySize: null },
}

describe('lib/capacity', () => {
  const mockReservations: ReservationLike[] = [
    {
      id: '1',
      date: '2026-04-15',
      time: '19:00',
      area: 'bar',
      guests: 4,
      status: 'confirmed',
    },
    {
      id: '2',
      date: '2026-04-15',
      time: '19:30',
      area: 'bar',
      guests: 3,
      status: 'pending',
    },
  ]

  describe('computeAvailability', () => {
    it('should return correct availability map for a date', () => {
      const availability = computeAvailability(mockReservations, '2026-04-15', ZONES)
      expect(availability).toHaveProperty('bar')
      expect(availability).toHaveProperty('table')
      expect(availability).toHaveProperty('capacity')
      expect(availability.capacity.bar).toBe(ZONES.bar.capacity)
      expect(availability.capacity.table).toBe(ZONES.table.capacity)
      expect(availability.maxBarParty).toBe(ZONES.bar.maxPartySize)
    })

    it('should exclude a reservation by ID', () => {
      const avail1 = computeAvailability(mockReservations, '2026-04-15', ZONES)
      const avail2 = computeAvailability(mockReservations, '2026-04-15', ZONES, { excludeReservationId: '1' })
      // At 19:00, reservation #1 occupies 4 seats in bar
      // So avail2 should have more bar capacity at 19:00
      expect(avail2.bar['19:00']).toBeGreaterThan(avail1.bar['19:00'])
    })

    it('should only count occupying statuses', () => {
      const cancelled: ReservationLike[] = [
        {
          id: '3',
          date: '2026-04-15',
          time: '19:00',
          area: 'bar',
          guests: 10,
          status: 'cancelled',
        },
      ]
      const avail = computeAvailability(cancelled, '2026-04-15', ZONES)
      // Cancelled should not reduce availability — remaining == full capacity.
      expect(avail.bar['19:00']).toBe(ZONES.bar.capacity)
    })

    it('honours a custom zone config (e.g. smaller bar)', () => {
      const tinyBar: ZoneConfig = {
        bar: { capacity: 6, maxPartySize: 2 },
        table: { capacity: 44, maxPartySize: null },
      }
      const avail = computeAvailability([], '2026-04-15', tinyBar)
      expect(avail.capacity.bar).toBe(6)
      expect(avail.maxBarParty).toBe(2)
      expect(avail.bar['19:00']).toBe(6)
    })
  })

  describe('checkSlotAvailability', () => {
    it('should return null for available slot', () => {
      const result = checkSlotAvailability([], {
        date: '2026-04-15',
        time: '19:00',
        area: 'bar',
        guests: 1,
      }, ZONES)
      expect(result).toBeNull()
    })

    it('should return error message when over capacity', () => {
      // Fill the bar to its cap with single-seat bookings — any new booking
      // at the same slot should get rejected.
      const reservations: ReservationLike[] = []
      for (let i = 0; i < ZONES.bar.capacity; i++) {
        reservations.push({
          id: `full-${i}`,
          date: '2026-04-15',
          time: '19:00',
          area: 'bar',
          guests: 1,
          status: 'confirmed',
        })
      }
      const result = checkSlotAvailability(reservations, {
        date: '2026-04-15',
        time: '19:00',
        area: 'bar',
        guests: 1,
      }, ZONES)
      expect(result).not.toBeNull()
      expect(typeof result).toBe('string')
    })

    it('rejects a bar party larger than maxPartySize (regardless of capacity)', () => {
      const result = checkSlotAvailability([], {
        date: '2026-04-15',
        time: '19:00',
        area: 'bar',
        guests: ZONES.bar.maxPartySize + 1,
      }, ZONES)
      expect(result).not.toBeNull()
      expect(result).toContain(String(ZONES.bar.maxPartySize))
    })

    it('accepts arbitrary HH:MM times (walk-ins)', () => {
      // Walk-ins may arrive at off-slot times like 20:37. The check should
      // evaluate zone usage at that exact minute, not require a 15-min slot.
      const result = checkSlotAvailability([], {
        date: '2026-04-15',
        time: '20:37',
        area: 'table',
        guests: 2,
      }, ZONES)
      expect(result).toBeNull()
    })

    it('rejects a walk-in when the zone is full at that minute', () => {
      // 14 bar seats occupied from 19:00..21:00. A walk-in at 20:37 overlaps.
      const res: ReservationLike[] = [
        { id: 'a', date: '2026-04-15', time: '19:00', area: 'bar', guests: 14, status: 'confirmed' },
      ]
      const result = checkSlotAvailability(res, {
        date: '2026-04-15',
        time: '20:37',
        area: 'bar',
        guests: 1,
      }, ZONES)
      expect(result).not.toBeNull()
    })

    it('allows a walk-in after the 120-min window clears', () => {
      // 14 bar seats at 19:00 release at 21:00 sharp. Walk-in at 21:05 is ok.
      const res: ReservationLike[] = [
        { id: 'a', date: '2026-04-15', time: '19:00', area: 'bar', guests: 14, status: 'confirmed' },
      ]
      const result = checkSlotAvailability(res, {
        date: '2026-04-15',
        time: '21:05',
        area: 'bar',
        guests: 2,
      }, ZONES)
      expect(result).toBeNull()
    })

    it('should exclude reservation ID when checking', () => {
      // An existing reservation that would fill the bar, but we're editing it
      // (so it's excluded from the usage sum) — the candidate at the same slot
      // must still fit.
      const existing: ReservationLike[] = [
        {
          id: 'existing',
          date: '2026-04-15',
          time: '19:00',
          area: 'bar',
          guests: ZONES.bar.capacity,
          status: 'confirmed',
        },
      ]
      const result = checkSlotAvailability(
        existing,
        {
          date: '2026-04-15',
          time: '19:00',
          area: 'bar',
          guests: 2,
        },
        ZONES,
        { excludeReservationId: 'existing' }
      )
      expect(result).toBeNull()
    })
  })

  describe('computeFloorCapacityAt', () => {
    const DATE = '2026-04-19'
    const FLOOR: FloorTable[] = [
      // 20 real seats: two 4-tops, a 6-top, and a 6-top — plus one inactive.
      { id: 't1', capacityMax: 4, active: true },
      { id: 't2', capacityMax: 4, active: true },
      { id: 't3', capacityMax: 6, active: true },
      { id: 't4', capacityMax: 6, active: true },
      { id: 't_inactive', capacityMax: 10, active: false },
    ]

    it('returns default buckets covering 18:30 → 23:00', () => {
      const out = computeFloorCapacityAt([], FLOOR, DATE)
      expect(out.map(b => b.start)).toEqual(DEFAULT_FLOOR_BUCKETS)
    })

    it('ignores inactive tables when summing capacity', () => {
      const out = computeFloorCapacityAt([], FLOOR, DATE)
      expect(out[0].realCapacity).toBe(20) // not 30
      expect(out.every(b => b.status === 'ok')).toBe(true)
    })

    it('status flips to over when booked > capacity', () => {
      const res: ReservationLike[] = [
        { id: 'a', date: DATE, time: '19:30', area: 'table', guests: 9, status: 'confirmed' },
        { id: 'b', date: DATE, time: '19:30', area: 'table', guests: 9, status: 'confirmed' },
        { id: 'c', date: DATE, time: '19:30', area: 'table', guests: 6, status: 'pending' },
      ]
      const out = computeFloorCapacityAt(res, FLOOR, DATE)
      const bucket = out.find(b => b.start === '20:00')
      expect(bucket?.bookedGuests).toBe(24)
      expect(bucket?.status).toBe('over')
    })

    it('status is tight at >=90% capacity', () => {
      // 18 / 20 = 90% → tight
      const res: ReservationLike[] = [
        { id: 'a', date: DATE, time: '19:30', area: 'table', guests: 10, status: 'confirmed' },
        { id: 'b', date: DATE, time: '19:30', area: 'table', guests: 8, status: 'confirmed' },
      ]
      const out = computeFloorCapacityAt(res, FLOOR, DATE)
      expect(out.find(b => b.start === '20:00')?.status).toBe('tight')
    })

    it('overlap math covers buckets within [start, start+duration)', () => {
      // One reservation at 19:00 (default duration = 120 min), so it should
      // appear in 19:00, 19:30, 20:00, 20:30, but NOT in 21:00.
      const res: ReservationLike[] = [
        { id: 'a', date: DATE, time: '19:00', area: 'table', guests: 4, status: 'confirmed' },
      ]
      const out = computeFloorCapacityAt(res, FLOOR, DATE)
      expect(out.find(b => b.start === '18:30')?.bookedGuests).toBe(0)
      expect(out.find(b => b.start === '19:00')?.bookedGuests).toBe(4)
      expect(out.find(b => b.start === '20:30')?.bookedGuests).toBe(4)
      expect(out.find(b => b.start === '21:00')?.bookedGuests).toBe(0)
    })

    it('cancelled / no_show do not count', () => {
      const res: ReservationLike[] = [
        { id: 'a', date: DATE, time: '19:30', area: 'table', guests: 8, status: 'cancelled' },
        { id: 'b', date: DATE, time: '19:30', area: 'table', guests: 8, status: 'no_show' },
      ]
      const out = computeFloorCapacityAt(res, FLOOR, DATE)
      expect(out.find(b => b.start === '20:00')?.bookedGuests).toBe(0)
    })

    it('other-date reservations are ignored', () => {
      const res: ReservationLike[] = [
        { id: 'a', date: '2026-04-18', time: '19:30', area: 'table', guests: 10, status: 'confirmed' },
      ]
      const out = computeFloorCapacityAt(res, FLOOR, DATE)
      expect(out.every(b => b.bookedGuests === 0)).toBe(true)
    })
  })
})
