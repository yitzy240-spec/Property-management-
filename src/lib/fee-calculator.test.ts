import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

import { calculatePropertyFees } from './fee-calculator'

describe('Fee Calculator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calculates commission correctly', async () => {
    // Mock property
    mockFrom.mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'p1',
              name: 'Test Property',
              commission_rate: 0.20,
              hourly_rate_agorot: 15000,
              management_fee_agorot: 50000,
            },
          }),
        }
      }
      if (table === 'bookings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({
            data: [
              { id: 'b1', guest_name: 'Yael', gross_rental_agorot: 500000, channel_fees_agorot: 50000 },
              { id: 'b2', guest_name: 'David', gross_rental_agorot: 300000, channel_fees_agorot: 30000 },
            ],
          }),
        }
      }
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({
            data: [
              { id: 't1', title: 'Plumbing fix', billable_hours: 2 },
            ],
          }),
        }
      }
      return { select: vi.fn().mockReturnThis() }
    })

    const result = await calculatePropertyFees('p1', '2026-04-01')

    // Commission: 20% of (500000-50000) + 20% of (300000-30000)
    // = 20% of 450000 + 20% of 270000
    // = 90000 + 54000 = 144000
    expect(result.commission_agorot).toBe(144000)

    // Hourly: 2 hours × 15000 agorot/hour = 30000
    expect(result.hourly_agorot).toBe(30000)

    // Fixed: 50000
    expect(result.fixed_agorot).toBe(50000)

    // Total: 144000 + 30000 + 50000 = 224000
    expect(result.total_agorot).toBe(224000)
  })

  it('handles zero bookings', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'p1', name: 'Empty', commission_rate: 0.20,
              hourly_rate_agorot: 0, management_fee_agorot: 30000,
            },
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({ data: [] }),
      }
    })

    const result = await calculatePropertyFees('p1', '2026-04-01')

    expect(result.commission_agorot).toBe(0)
    expect(result.hourly_agorot).toBe(0)
    expect(result.fixed_agorot).toBe(30000)
    expect(result.total_agorot).toBe(30000)
  })

  it('uses integer math throughout (no floating point)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'p1', name: 'Test', commission_rate: 0.20,
              hourly_rate_agorot: 15000, management_fee_agorot: 50000,
            },
          }),
        }
      }
      if (table === 'bookings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({
            data: [
              // 333.33 ILS net — tests rounding
              { id: 'b1', guest_name: 'Test', gross_rental_agorot: 33333, channel_fees_agorot: 0 },
            ],
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({ data: [] }),
      }
    })

    const result = await calculatePropertyFees('p1', '2026-04-01')

    // 20% of 33333 = 6666.6 → should round to 6667
    expect(result.commission_agorot).toBe(6667)
    expect(Number.isInteger(result.commission_agorot)).toBe(true)
    expect(Number.isInteger(result.total_agorot)).toBe(true)
  })
})
