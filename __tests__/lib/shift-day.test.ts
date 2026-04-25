import { describe, it, expect } from 'vitest'
import { shiftDayLocal, isSameDayBookingClosed } from '@/lib/shift-day'

describe('lib/shift-day', () => {
  describe('shiftDayLocal', () => {
    it('should return a YYYY-MM-DD formatted string', () => {
      const result = shiftDayLocal()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should compute in Asia/Jerusalem timezone', () => {
      const result = shiftDayLocal()
      // Just verify it's a valid date string
      const [year, month, day] = result.split('-').map(Number)
      expect(year).toBeGreaterThan(2020)
      expect(month).toBeGreaterThanOrEqual(1)
      expect(month).toBeLessThanOrEqual(12)
      expect(day).toBeGreaterThanOrEqual(1)
      expect(day).toBeLessThanOrEqual(31)
    })
  })

  describe('isSameDayBookingClosed', () => {
    // A reference "now" at Monday 2026-04-20 18:30 Israel time (summer
    // daylight savings → UTC+3, so 15:30 UTC).
    const mondayBefore19 = new Date('2026-04-20T15:30:00Z')
    // Same Monday but after 19:00 Israel — 19:30 IDT = 16:30 UTC.
    const mondayAfter19 = new Date('2026-04-20T16:30:00Z')
    // Tuesday morning 02:00 Israel (still Monday's shift) — 23:00 UTC of Mon.
    const tuesdayEarly = new Date('2026-04-20T23:00:00Z')
    // Tuesday 06:00 Israel (shift day rolled over) — 03:00 UTC of Tuesday.
    const tuesdayMorning = new Date('2026-04-21T03:00:00Z')

    it('returns false before 19:00 when booking today', () => {
      expect(isSameDayBookingClosed('2026-04-20', mondayBefore19)).toBe(false)
    })

    it('returns true at/after 19:00 when booking today', () => {
      expect(isSameDayBookingClosed('2026-04-20', mondayAfter19)).toBe(true)
    })

    it('returns true past midnight (shift still running) when booking the shift day', () => {
      // At 02:00 Tuesday Israel time, shiftDayLocal() is still 2026-04-20.
      // A customer trying to book for 2026-04-20 is obviously too late.
      expect(isSameDayBookingClosed('2026-04-20', tuesdayEarly)).toBe(true)
    })

    it('returns false when booking a future date', () => {
      expect(isSameDayBookingClosed('2026-04-21', mondayAfter19)).toBe(false)
      expect(isSameDayBookingClosed('2026-05-01', mondayAfter19)).toBe(false)
    })

    it('returns false on a fresh shift morning when booking that same day', () => {
      // Tuesday 06:00 — shift day is Tuesday, booking Tuesday is fine.
      expect(isSameDayBookingClosed('2026-04-21', tuesdayMorning)).toBe(false)
    })

    it('returns false when booking a past date (handled elsewhere, but not this gate)', () => {
      // Past-date validation isn't this function's job. The helper only
      // fires when bookingDate === current shift day.
      expect(isSameDayBookingClosed('2026-04-19', mondayAfter19)).toBe(false)
    })
  })
})
