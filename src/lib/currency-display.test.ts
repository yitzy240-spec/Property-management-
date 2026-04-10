import { describe, it, expect } from 'vitest'

/**
 * Tests for currency display logic.
 * Validates agorot-to-display conversion and multi-currency support.
 */
describe('Currency Display', () => {
  function formatCurrency(agorot: number, currency = 'ILS'): string {
    const amount = agorot / 100
    const symbols: Record<string, string> = { ILS: '₪', USD: '$', EUR: '€' }
    const symbol = symbols[currency] || currency + ' '
    return `${symbol}${Math.abs(amount).toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  it('converts agorot to ILS display', () => {
    expect(formatCurrency(500000)).toBe('₪5,000.00')
  })

  it('converts agorot to USD display', () => {
    expect(formatCurrency(500000, 'USD')).toBe('$5,000.00')
  })

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('₪0.00')
  })

  it('handles fractional agorot', () => {
    expect(formatCurrency(12345)).toBe('₪123.45')
  })

  it('does not show double currency symbols', () => {
    const result = formatCurrency(500000, 'USD')
    expect(result).not.toContain('₪')
    expect(result.match(/\$/g)?.length).toBe(1)
  })

  it('handles unknown currency with code prefix', () => {
    const result = formatCurrency(100000, 'GBP')
    expect(result).toContain('GBP')
  })
})
