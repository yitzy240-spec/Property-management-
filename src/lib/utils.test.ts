import { describe, it, expect } from 'vitest'
import { cn, formatILS, toAgorot, formatDateJerusalem, VAT_THRESHOLD_AGOROT, VAT_WARNING_PERCENT } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('merges tailwind conflicts', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6')
  })
})

describe('formatILS', () => {
  it('converts agorot to ILS with ₪ symbol', () => {
    const result = formatILS(10050)
    expect(result).toContain('₪')
    expect(result).toContain('100')
    expect(result).toContain('50')
  })

  it('handles zero', () => {
    const result = formatILS(0)
    expect(result).toContain('₪')
    expect(result).toContain('0')
  })

  it('handles large amounts', () => {
    const result = formatILS(12283300) // ₪122,833.00
    expect(result).toContain('122')
    expect(result).toContain('833')
  })

  it('handles single agorot', () => {
    const result = formatILS(1)
    expect(result).toContain('0.01')
  })
})

describe('toAgorot', () => {
  it('converts ILS to agorot', () => {
    expect(toAgorot(100.50)).toBe(10050)
  })

  it('rounds correctly', () => {
    expect(toAgorot(10.999)).toBe(1100)
    expect(toAgorot(10.001)).toBe(1000)
  })

  it('handles zero', () => {
    expect(toAgorot(0)).toBe(0)
  })

  it('handles typical bill amounts', () => {
    expect(toAgorot(842.50)).toBe(84250)
    expect(toAgorot(122833)).toBe(12283300)
  })
})

describe('formatDateJerusalem', () => {
  it('formats short date', () => {
    const result = formatDateJerusalem('2026-04-03T12:00:00Z', 'short')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('formats long date', () => {
    const result = formatDateJerusalem('2026-04-03T12:00:00Z', 'long')
    expect(result).toContain('2026')
  })

  it('defaults to short format', () => {
    const result = formatDateJerusalem('2026-04-03T12:00:00Z')
    expect(result).toBeTruthy()
  })
})

describe('VAT constants', () => {
  it('has correct threshold in agorot', () => {
    expect(VAT_THRESHOLD_AGOROT).toBe(12_283_300)
  })

  it('has 90% warning threshold', () => {
    expect(VAT_WARNING_PERCENT).toBe(0.9)
  })

  it('threshold converts to ₪122,833', () => {
    expect(VAT_THRESHOLD_AGOROT / 100).toBe(122833)
  })
})
