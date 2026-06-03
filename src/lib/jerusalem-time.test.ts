import { describe, it, expect } from 'vitest'
import { jerusalemDateAt } from './jerusalem-time'

describe('jerusalemDateAt', () => {
  it('returns 07:00 Jerusalem on day N from a summer (IDT) anchor', () => {
    // 2026-06-03 10:00 UTC = 13:00 Jerusalem (IDT, UTC+3)
    // days=2 → target is 07:00 IDT on 2026-06-05 = 04:00 UTC
    expect(
      jerusalemDateAt(2, 7, 0, new Date('2026-06-03T10:00:00Z')).toISOString(),
    ).toBe('2026-06-05T04:00:00.000Z')
  })

  it('returns 23:59 Jerusalem on day N from a winter (IST) anchor', () => {
    // 2026-02-01 12:00 UTC = 14:00 Jerusalem (IST, UTC+2)
    // days=5 → 23:59 IST on 2026-02-06 = 21:59 UTC
    expect(
      jerusalemDateAt(5, 23, 59, new Date('2026-02-01T12:00:00Z')).toISOString(),
    ).toBe('2026-02-06T21:59:00.000Z')
  })

  it('correctly crosses the IST→IDT DST boundary (spring forward)', () => {
    // Israel 2026: DST starts on 2026-03-27 (last Friday before April), clocks jump 02:00→03:00.
    // Anchor: 2026-03-26 06:00 UTC (08:00 Jerusalem, still IST/UTC+2).
    // days=2 → target 07:00 Jerusalem on 2026-03-28 (after DST, IDT/UTC+3) = 04:00 UTC.
    const result = jerusalemDateAt(2, 7, 0, new Date('2026-03-26T06:00:00Z'))
    expect(result.toISOString()).toBe('2026-03-28T04:00:00.000Z')
  })

  it('correctly crosses the IDT→IST DST boundary (fall back)', () => {
    // Israel 2026: DST ends on 2026-10-25, clocks jump 02:00→01:00.
    // Anchor: 2026-10-24 12:00 UTC (15:00 IDT).
    // days=2 → target 07:00 Jerusalem on 2026-10-26 (after DST end, IST/UTC+2) = 05:00 UTC.
    const result = jerusalemDateAt(2, 7, 0, new Date('2026-10-24T12:00:00Z'))
    expect(result.toISOString()).toBe('2026-10-26T05:00:00.000Z')
  })
})
