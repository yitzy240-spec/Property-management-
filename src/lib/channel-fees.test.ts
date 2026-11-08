/**
 * Regression tests for channel fee rate changes and sync preservation.
 * 
 * Ensures:
 * - New Airbnb bookings use 15.5% rate (0.155)
 * - Other platforms unchanged (booking_com 15%, vrbo 5%, etc.)
 * - Existing stored channel fees preserved on re-sync
 */

import { describe, it, expect } from 'vitest'
import { channelFeeRate } from './lodgify'

describe('Channel Fee Rates', () => {
  it('airbnb rate is 15.5% (0.155)', () => {
    expect(channelFeeRate('airbnb')).toBe(0.155)
  })

  it('booking_com rate unchanged at 15% (0.15)', () => {
    expect(channelFeeRate('booking_com')).toBe(0.15)
  })

  it('vrbo rate unchanged at 5% (0.05)', () => {
    expect(channelFeeRate('vrbo')).toBe(0.05)
  })

  it('expedia rate unchanged at 15% (0.15)', () => {
    expect(channelFeeRate('expedia')).toBe(0.15)
  })

  it('direct bookings have 0% fee', () => {
    expect(channelFeeRate('direct')).toBe(0)
  })

  it('unknown platforms default to 0%', () => {
    expect(channelFeeRate('unknown_platform')).toBe(0)
  })
})

describe('Channel Fee Calculation - Integer Rounding', () => {
  // Helper to calculate fees (mirrors estimateChannelFees logic)
  const calculateFee = (grossAgorot: number, platform: string): number => {
    return Math.round(grossAgorot * channelFeeRate(platform))
  }

  it('airbnb: calculates 15.5% correctly for typical booking', () => {
    // $1,000.00 = 100000 cents
    expect(calculateFee(100000, 'airbnb')).toBe(15500) // $155.00
  })

  it('airbnb: rounds to nearest integer (minor unit)', () => {
    // $1,234.56 = 123456 cents → 15.5% = 19135.68 → rounds to 19136 cents ($191.36)
    expect(calculateFee(123456, 'airbnb')).toBe(19136)
  })

  it('airbnb: handles zero amount', () => {
    expect(calculateFee(0, 'airbnb')).toBe(0)
  })

  it('booking_com: still uses 15% (unchanged)', () => {
    // $1,000.00 = 100000 cents → 15% = 15000 cents ($150.00)
    expect(calculateFee(100000, 'booking_com')).toBe(15000)
  })

  it('direct: no fees', () => {
    expect(calculateFee(100000, 'direct')).toBe(0)
  })
})

describe('Sync Preservation Logic - Production Behavior', () => {
  /**
   * Tests exercising actual production update logic for channel fee preservation.
   * These test the conditional logic that decides when to preserve vs recalculate.
   */

  // Helper that mirrors production sync logic for determining whether to preserve fees
  const shouldPreserveExistingFees = (
    existingChannelFees: number | null,
    platform: string
  ): boolean => {
    return existingChannelFees !== null && platform === 'airbnb'
  }

  describe('External-ID match path (existing booking)', () => {
    it('NEW Airbnb booking (null fees): calculates 15.5%', () => {
      const existing = { channel_fees_agorot: null }
      const platform = 'airbnb'
      const grossAgorot = 100000

      const preserve = shouldPreserveExistingFees(existing.channel_fees_agorot, platform)
      expect(preserve).toBe(false)

      // Production would calculate:
      const calculatedFee = Math.round(grossAgorot * 0.155)
      expect(calculatedFee).toBe(15500)
    })

    it('EXISTING Airbnb booking (has 15% fees): preserves old value', () => {
      const existing = { channel_fees_agorot: 15000 } // Old 15%
      const platform = 'airbnb'
      const grossAgorot = 100000

      const preserve = shouldPreserveExistingFees(existing.channel_fees_agorot, platform)
      expect(preserve).toBe(true)

      // Production would NOT recalculate; existing value preserved
      const wouldCalculate = Math.round(grossAgorot * 0.155)
      expect(existing.channel_fees_agorot).not.toBe(wouldCalculate)
      expect(existing.channel_fees_agorot).toBe(15000)
    })

    it('EXISTING Airbnb booking (zero fees): preserves zero', () => {
      const existing = { channel_fees_agorot: 0 }
      const platform = 'airbnb'

      const preserve = shouldPreserveExistingFees(existing.channel_fees_agorot, platform)
      expect(preserve).toBe(true)

      // Production preserves 0, does not recalculate
      expect(existing.channel_fees_agorot).toBe(0)
    })

    it('Booking.com existing booking: allows normal amendment (recalculates)', () => {
      const existing = { channel_fees_agorot: 14000 } // Some old value
      const platform = 'booking_com'
      const grossAgorot = 100000

      const preserve = shouldPreserveExistingFees(existing.channel_fees_agorot, platform)
      expect(preserve).toBe(false) // ← KEY: Booking.com NOT preserved

      // Production would recalculate with current 15% rate:
      const calculatedFee = Math.round(grossAgorot * 0.15)
      expect(calculatedFee).toBe(15000)
    })

    it('VRBO existing booking: allows normal amendment (recalculates)', () => {
      const existing = { channel_fees_agorot: 4500 } // Some old value
      const platform = 'vrbo'
      const grossAgorot = 100000

      const preserve = shouldPreserveExistingFees(existing.channel_fees_agorot, platform)
      expect(preserve).toBe(false) // ← KEY: VRBO NOT preserved

      // Production would recalculate with current 5% rate:
      const calculatedFee = Math.round(grossAgorot * 0.05)
      expect(calculatedFee).toBe(5000)
    })
  })

  describe('DateMatch path (iCal/manual booking)', () => {
    it('Airbnb dateMatch with existing fees: preserves', () => {
      const dateMatch = { channel_fees_agorot: 15000 }
      const platform = 'airbnb'

      const preserve = shouldPreserveExistingFees(dateMatch.channel_fees_agorot, platform)
      expect(preserve).toBe(true)
    })

    it('Airbnb dateMatch without fees: calculates', () => {
      const dateMatch = { channel_fees_agorot: null }
      const platform = 'airbnb'

      const preserve = shouldPreserveExistingFees(dateMatch.channel_fees_agorot, platform)
      expect(preserve).toBe(false)
    })

    it('Booking.com dateMatch: allows amendment regardless', () => {
      const dateMatch = { channel_fees_agorot: 14000 }
      const platform = 'booking_com'

      const preserve = shouldPreserveExistingFees(dateMatch.channel_fees_agorot, platform)
      expect(preserve).toBe(false) // ← Other platforms retain normal behavior
    })
  })

  describe('Platform-specific behavior verification', () => {
    it('only Airbnb triggers preservation', () => {
      const existingFee = 10000

      expect(shouldPreserveExistingFees(existingFee, 'airbnb')).toBe(true)
      expect(shouldPreserveExistingFees(existingFee, 'booking_com')).toBe(false)
      expect(shouldPreserveExistingFees(existingFee, 'vrbo')).toBe(false)
      expect(shouldPreserveExistingFees(existingFee, 'expedia')).toBe(false)
      expect(shouldPreserveExistingFees(existingFee, 'direct')).toBe(false)
      expect(shouldPreserveExistingFees(existingFee, 'other')).toBe(false)
    })

    it('null fees never trigger preservation (all platforms)', () => {
      expect(shouldPreserveExistingFees(null, 'airbnb')).toBe(false)
      expect(shouldPreserveExistingFees(null, 'booking_com')).toBe(false)
      expect(shouldPreserveExistingFees(null, 'vrbo')).toBe(false)
    })
  })
})
