import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeAvailability,
  checkSlotAvailability,
  computeFloorCapacityAt,
  DEFAULT_FLOOR_BUCKETS,
  FloorTable,
  ReservationLike,
} from '@/lib/capacity'

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
      const availability = computeAvailability(mockReservations, '2026-04-15')
      expect(availability).toHaveProperty('bar')
      expect(availability).toHaveProperty('table')
      expect(availability).toHaveProperty('capacity')
      expect(availability.capacity.bar).toBe(999) // default
      expect(availability.capacity.table).toBe(999) // default
    })

    it('should exclude a reservation by ID', () => {
      const avail1 = computeAvailability(mockReservations, '2026-04-15')
      const avail2 = computeAvailability(mockReservations, '2026-04-15', { excludeReservationId: '1' })
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
      const avail = computeAvailability(cancelled, '2026-04-15')
      // Cancelled should not reduce availability
      expect(avail.bar['19:00']).toBe(999)
    })
  })

  describe('checkSlotAvailability', () => {
    it('should return null for available slot', () => {
      const result = checkSlotAvailability([], {
        date: '2026-04-15',
        time: '19:00',
        area: 'bar',
        guests: 1,
      })
      expect(result).toBeNull()
    })

    it('should return error message when over capacity', () => {
      const reservations: ReservationLike[] = []
      for (let i = 0; i < 1000; i++) {
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
      })
      expect(result).not.toBeNull()
      expect(typeof result).toBe('string')
    })

    it('should exclude reservation ID when checking', () => {
      const existing: ReservationLike[] = [
        {
          id: 'existing',
          date: '2026-04-15',
          time: '19:00',
          area: 'bar',
          guests: 995,
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
