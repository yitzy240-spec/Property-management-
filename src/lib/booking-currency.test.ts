import { describe, it, expect } from 'vitest'
import { toIlsAgorot, DEFAULT_USD_ILS_RATE } from './booking-currency'

describe('toIlsAgorot', () => {
  it('passes ILS through unchanged', () => {
    expect(toIlsAgorot(100000, 'ILS', null)).toEqual({ agorot: 100000, converted: true, label: '₪1,000' })
    expect(toIlsAgorot(100000, null, null).agorot).toBe(100000)
  })

  it('converts USD with the rate saved on the booking (Ariel: $1,000 × 3.70)', () => {
    const r = toIlsAgorot(100000, 'USD', 3.7)
    expect(r.agorot).toBe(370000)
    expect(r.label).toBe('$1,000 × 3.70 = ₪3,700')
  })

  it('uses the booking rate, not the default, when present', () => {
    expect(toIlsAgorot(100000, 'USD', 3.55).agorot).toBe(355000)
  })

  it('falls back to the default USD rate and says so', () => {
    const r = toIlsAgorot(100000, 'USD', null)
    expect(r.agorot).toBe(Math.round(100000 * DEFAULT_USD_ILS_RATE))
    expect(r.label).toContain('(default rate)')
  })

  it('refuses to guess a rate for other currencies', () => {
    const r = toIlsAgorot(50000, 'EUR', null)
    expect(r.converted).toBe(false)
    expect(r.agorot).toBe(0)
    expect(r.label).toMatch(/no exchange rate/)
  })
})
