import { describe, it, expect } from 'vitest'
import { classifyTable, ReservationForLive } from '@/lib/table-status'

// Build a reservation tied to table id 'T1' at HH:mm on the given date.
function mkRes(
  overrides: Partial<ReservationForLive> & {
    id?: string; date?: string; time: string; status: ReservationForLive['status'];
  },
): ReservationForLive {
  return {
    id: overrides.id ?? 'r1',
    name: overrides.name ?? 'אלון כהן',
    date: overrides.date ?? '2026-04-19',
    time: overrides.time,
    status: overrides.status,
    guests: overrides.guests ?? 2,
    tables: overrides.tables ?? [{ id: 'T1' }],
  }
}

// Time helpers: build a Date that corresponds to HH:mm Israel time on the
// shift date. Matches the UTC offset used by lib/table-status's timeOn.
function nowAt(dateStr: string, time: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h - 2, m, 0, 0))
}

const DATE = '2026-04-19'

describe('classifyTable', () => {
  it('returns free on empty input', () => {
    const s = classifyTable('T1', [], nowAt(DATE, '19:00'), DATE)
    expect(s.status).toBe('free')
    expect(s.rows).toEqual([])
    expect(s.next).toBeNull()
  })

  it('marks occupied when an arrived reservation is within its window', () => {
    const res = [mkRes({ time: '19:00', status: 'arrived' })]
    const s = classifyTable('T1', res, nowAt(DATE, '19:30'), DATE)
    expect(s.status).toBe('occupied')
  })

  it('occupied expires after RESERVATION_DURATION_MINUTES', () => {
    const res = [mkRes({ time: '19:00', status: 'arrived' })]
    // 19:00 + 120min = 21:00; 21:01 should no longer be occupied (and nothing
    // else is pending/confirmed, so → free).
    const s = classifyTable('T1', res, nowAt(DATE, '21:01'), DATE)
    expect(s.status).toBe('free')
  })

  it('marks reserved_soon when a confirmed booking starts in 45 min', () => {
    const res = [mkRes({ time: '19:45', status: 'confirmed' })]
    const s = classifyTable('T1', res, nowAt(DATE, '19:00'), DATE)
    expect(s.status).toBe('reserved_soon')
  })

  it('is free when the only booking is 3 hours away', () => {
    const res = [mkRes({ time: '22:00', status: 'confirmed' })]
    const s = classifyTable('T1', res, nowAt(DATE, '19:00'), DATE)
    expect(s.status).toBe('free')
  })

  it('occupied beats reserved_soon', () => {
    const res = [
      mkRes({ id: 'a', time: '19:00', status: 'arrived' }),
      mkRes({ id: 'b', time: '19:30', status: 'confirmed' }),
    ]
    const s = classifyTable('T1', res, nowAt(DATE, '19:15'), DATE)
    expect(s.status).toBe('occupied')
  })

  it('ignores reservations on other tables', () => {
    const res = [mkRes({ time: '19:00', status: 'arrived', tables: [{ id: 'T2' }] })]
    const s = classifyTable('T1', res, nowAt(DATE, '19:00'), DATE)
    expect(s.status).toBe('free')
    expect(s.rows).toEqual([])
  })

  it('ignores cancelled and no_show statuses', () => {
    const res = [
      mkRes({ id: 'a', time: '19:00', status: 'cancelled' }),
      mkRes({ id: 'b', time: '19:10', status: 'no_show' }),
    ]
    const s = classifyTable('T1', res, nowAt(DATE, '19:20'), DATE)
    expect(s.status).toBe('free')
    expect(s.rows).toEqual([])
  })

  it('ignores rows on a different shift date', () => {
    const res = [mkRes({ time: '19:00', status: 'arrived', date: '2026-04-18' })]
    const s = classifyTable('T1', res, nowAt(DATE, '19:00'), DATE)
    expect(s.status).toBe('free')
    expect(s.rows).toEqual([])
  })

  it('sorts rows by time and sets next to the earliest future non-arrived', () => {
    const res = [
      mkRes({ id: 'late',  name: 'יובל',  time: '21:00', status: 'confirmed' }),
      mkRes({ id: 'arr',   name: 'דנה',   time: '19:30', status: 'arrived' }),
      mkRes({ id: 'mid',   name: 'רון',   time: '20:15', status: 'pending' }),
    ]
    const s = classifyTable('T1', res, nowAt(DATE, '19:45'), DATE)
    expect(s.rows.map(r => r.reservationId)).toEqual(['arr', 'mid', 'late'])
    expect(s.next?.reservationId).toBe('mid')
  })
})
