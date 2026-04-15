import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeAvailability,
  checkSlotAvailability,
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
})
