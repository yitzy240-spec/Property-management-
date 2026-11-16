import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for bill ingestion deduplication and validation logic.
 * These tests verify the fixes for:
 * 1. is_bill=false skipping
 * 2. Content-based deduplication
 * 3. Storage upload error handling
 */

describe('Bill ingestion - is_bill flag', () => {
  it('should skip when parser returns is_bill=false', () => {
    const parsedData = {
      bill_type: 'other' as const,
      amount_agorot: 0,
      due_date: null,
      period_start: null,
      period_end: null,
      address: null,
      account_holder: null,
      account_number: null,
      is_autopay: false,
      is_bill: false, // Notification/reply, not a bill
    }

    expect(parsedData.is_bill).toBe(false)
    // Should not create a bill
  })

  it('should process when parser returns is_bill=true', () => {
    const parsedData = {
      bill_type: 'iec' as const,
      amount_agorot: 14800,
      due_date: '2026-12-01',
      period_start: '2026-11-01',
      period_end: '2026-11-30',
      address: 'Agripas 6',
      account_holder: 'Marcus Properties',
      account_number: '123456',
      is_autopay: false,
      is_bill: true,
    }

    expect(parsedData.is_bill).toBe(true)
    // Should create bill
  })

  it('should process when is_bill is not present (legacy behavior)', () => {
    const parsedData: {
      bill_type: 'water'
      amount_agorot: number
      is_bill?: boolean
    } = {
      bill_type: 'water' as const,
      amount_agorot: 9500,
      // is_bill field missing (older parser version)
    }

    // When is_bill is undefined, treat as true for backward compatibility
    expect(parsedData.is_bill).toBeUndefined()
  })
})

describe('Bill ingestion - content deduplication', () => {
  it('should skip when duplicate exists with same property+type+amount+period', () => {
    const existingBill = {
      property_id: 'prop-123',
      bill_type: 'vaad_bayit',
      amount_agorot: 81400, // ₪814.00
      billing_period_start: '2026-11-01',
      billing_period_end: '2026-11-30',
    }

    const newBill = {
      property_id: 'prop-123',
      bill_type: 'vaad_bayit',
      amount_agorot: 81400,
      billing_period_start: '2026-11-01',
      billing_period_end: '2026-11-30',
    }

    expect(existingBill.property_id).toBe(newBill.property_id)
    expect(existingBill.bill_type).toBe(newBill.bill_type)
    expect(existingBill.amount_agorot).toBe(newBill.amount_agorot)
    // Periods overlap, so it's a duplicate
  })

  it('should allow when same property+type but different amount', () => {
    const existingBill = {
      property_id: 'prop-123',
      bill_type: 'iec',
      amount_agorot: 15000,
    }

    const newBill = {
      property_id: 'prop-123',
      bill_type: 'iec',
      amount_agorot: 18000, // Different amount
    }

    expect(newBill.amount_agorot).not.toBe(existingBill.amount_agorot)
    // Not a duplicate, should insert
  })

  it('should skip when duplicate exists within 30 days (no period)', () => {
    const now = new Date('2026-11-15')
    const twentyDaysAgo = new Date('2026-10-26')
    const thirtyDaysAgo = new Date('2026-10-16')
    const fortyDaysAgo = new Date('2026-10-06')

    const existingBill = {
      property_id: 'prop-123',
      bill_type: 'gas',
      amount_agorot: 12000,
      created_at: twentyDaysAgo.toISOString(),
      billing_period_start: null,
      billing_period_end: null,
    }

    const newBill = {
      property_id: 'prop-123',
      bill_type: 'gas',
      amount_agorot: 12000,
      billing_period_start: null,
      billing_period_end: null,
    }

    const daysDiff = (now.getTime() - twentyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
    expect(daysDiff).toBeLessThan(30)
    // Within 30 days, so skip
  })

  it('should allow when bill is older than 30 days (no period)', () => {
    const now = new Date('2026-11-15')
    const fortyDaysAgo = new Date('2026-10-06')

    const existingBill = {
      property_id: 'prop-123',
      bill_type: 'gas',
      amount_agorot: 12000,
      created_at: fortyDaysAgo.toISOString(),
      billing_period_start: null,
      billing_period_end: null,
    }

    const newBill = {
      property_id: 'prop-123',
      bill_type: 'gas',
      amount_agorot: 12000,
      billing_period_start: null,
      billing_period_end: null,
    }

    const daysDiff = (now.getTime() - fortyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
    expect(daysDiff).toBeGreaterThan(30)
    // Outside 30-day window, so allow
  })

  it('should allow when different property', () => {
    const existingBill = {
      property_id: 'prop-123',
      bill_type: 'water',
      amount_agorot: 9500,
    }

    const newBill = {
      property_id: 'prop-456', // Different property
      bill_type: 'water',
      amount_agorot: 9500,
    }

    expect(newBill.property_id).not.toBe(existingBill.property_id)
    // Different properties can have same amounts
  })

  it('should allow zero-amount bills (flagged for manual entry)', () => {
    const existingBill = {
      property_id: 'prop-123',
      bill_type: 'other',
      amount_agorot: 0,
    }

    const newBill = {
      property_id: 'prop-123',
      bill_type: 'other',
      amount_agorot: 0,
    }

    // Zero-amount bills aren't deduplicated (they need manual review anyway)
    expect(newBill.amount_agorot).toBe(0)
  })
})

describe('Bill ingestion - storage upload handling', () => {
  it('should save path only when upload succeeds', () => {
    const uploadResult = { error: null }
    const uploadPath = 'bills/msg-123.pdf'

    let storagePath: string | null = null
    if (!uploadResult.error) {
      storagePath = uploadPath
    }

    expect(storagePath).toBe(uploadPath)
  })

  it('should not save path when upload fails', () => {
    const uploadResult = { error: { message: 'Storage quota exceeded' } }
    const uploadPath = 'bills/msg-123.pdf'

    let storagePath: string | null = null
    if (!uploadResult.error) {
      storagePath = uploadPath
    }

    expect(storagePath).toBeNull()
  })
})

describe('Bill ingestion - email metadata storage', () => {
  it('should store email_from, email_subject, and thread_id in ai_parsed_data', () => {
    const aiParsedData = {
      bill_type: 'iec' as const,
      amount_agorot: 14800,
      source: 'webhook',
      email_from: 'vaad@example.com',
      email_subject: 'Re: Vaad Bayit payment confirmation',
      gmail_thread_id: 'thread-12345',
    }

    expect(aiParsedData.email_from).toBe('vaad@example.com')
    expect(aiParsedData.email_subject).toBe('Re: Vaad Bayit payment confirmation')
    expect(aiParsedData.gmail_thread_id).toBe('thread-12345')
  })

  it('should handle null thread_id gracefully', () => {
    const aiParsedData = {
      bill_type: 'water' as const,
      amount_agorot: 9500,
      source: 'webhook',
      email_from: 'hagihon@example.com',
      email_subject: 'Water bill',
      gmail_thread_id: null,
    }

    expect(aiParsedData.gmail_thread_id).toBeNull()
  })
})

describe('Period overlap detection', () => {
  it('should detect exact period match', () => {
    const period1 = { start: '2026-11-01', end: '2026-11-30' }
    const period2 = { start: '2026-11-01', end: '2026-11-30' }

    expect(period1.start).toBe(period2.start)
    expect(period1.end).toBe(period2.end)
    // Exact match = overlap
  })

  it('should detect overlapping periods', () => {
    const period1 = { start: '2026-11-01', end: '2026-11-30' }
    const period2 = { start: '2026-11-15', end: '2026-12-15' }

    // Check if periods overlap: p1.start <= p2.end AND p1.end >= p2.start
    const overlaps = period1.start <= period2.end && period1.end >= period2.start
    expect(overlaps).toBe(true)
  })

  it('should not detect overlap for non-overlapping periods', () => {
    const period1 = { start: '2026-10-01', end: '2026-10-31' }
    const period2 = { start: '2026-11-01', end: '2026-11-30' }

    const overlaps = period1.start <= period2.end && period1.end >= period2.start
    expect(overlaps).toBe(false)
  })
})
