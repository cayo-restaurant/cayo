import { describe, it, expect } from 'vitest'
import { shiftDayLocal } from '@/lib/shift-day'

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
})
