import { describe, test, expect } from 'vitest'
import { buildBillsStatusFilter, canEditBill } from './bills'

describe('buildBillsStatusFilter', () => {
  test('returns exclude_rejected mode when statusParam is null', () => {
    const result = buildBillsStatusFilter(null)
    expect(result.mode).toBe('exclude_rejected')
    expect(result.statuses).toBeUndefined()
  })

  test('returns explicit mode with single status', () => {
    const result = buildBillsStatusFilter('approved')
    expect(result.mode).toBe('explicit')
    expect(result.statuses).toEqual(['approved'])
  })

  test('returns explicit mode with comma-separated statuses', () => {
    const result = buildBillsStatusFilter('pending_review,approved,rejected')
    expect(result.mode).toBe('explicit')
    expect(result.statuses).toEqual(['pending_review', 'approved', 'rejected'])
  })

  test('trims whitespace from status names', () => {
    const result = buildBillsStatusFilter('pending_review , approved , rejected')
    expect(result.mode).toBe('explicit')
    expect(result.statuses).toEqual(['pending_review', 'approved', 'rejected'])
  })

  test('handles rejected status explicitly requested', () => {
    const result = buildBillsStatusFilter('rejected')
    expect(result.mode).toBe('explicit')
    expect(result.statuses).toEqual(['rejected'])
  })
})

describe('canEditBill', () => {
  test('returns true for pending_review status', () => {
    expect(canEditBill('pending_review')).toBe(true)
  })

  test('returns true for flagged status', () => {
    expect(canEditBill('flagged')).toBe(true)
  })

  test('returns true for rejected status', () => {
    expect(canEditBill('rejected')).toBe(true)
  })

  test('returns false for approved status', () => {
    expect(canEditBill('approved')).toBe(false)
  })
})
