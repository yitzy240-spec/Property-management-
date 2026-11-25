import { describe, it, expect } from 'vitest'
import { 
  BILL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  formatPaymentMethod,
} from '@/lib/bill-payment-method'

describe('Bill Payment Method Constants', () => {
  it('defines all payment method constants', () => {
    expect(BILL_PAYMENT_METHODS.UNSET).toBeNull()
    expect(BILL_PAYMENT_METHODS.PAID_BY_OWNER_CASH).toBe('paid_by_owner_cash')
    expect(BILL_PAYMENT_METHODS.PAID_BY_OWNER_CC).toBe('paid_by_owner_cc')
    expect(BILL_PAYMENT_METHODS.PAID_BY_ADMIN).toBe('paid_by_admin')
  })

  it('provides human-readable labels', () => {
    expect(PAYMENT_METHOD_LABELS.paid_by_owner_cash).toBe('Owner paid (Cash)')
    expect(PAYMENT_METHOD_LABELS.paid_by_owner_cc).toBe('Owner paid (Credit Card)')
    expect(PAYMENT_METHOD_LABELS.paid_by_admin).toBe('Paid by admin')
  })

  it('provides dropdown options', () => {
    expect(PAYMENT_METHOD_OPTIONS).toHaveLength(4)
    expect(PAYMENT_METHOD_OPTIONS[0]).toEqual({ value: '', label: 'Not set' })
    expect(PAYMENT_METHOD_OPTIONS[1].value).toBe('paid_by_owner_cash')
    expect(PAYMENT_METHOD_OPTIONS[2].value).toBe('paid_by_owner_cc')
    expect(PAYMENT_METHOD_OPTIONS[3].value).toBe('paid_by_admin')
  })

  it('formats payment method for display', () => {
    expect(formatPaymentMethod(null)).toBe('Not set')
    expect(formatPaymentMethod('')).toBe('Not set')
    expect(formatPaymentMethod('paid_by_owner_cash')).toBe('Owner paid (Cash)')
    expect(formatPaymentMethod('paid_by_owner_cc')).toBe('Owner paid (Credit Card)')
    expect(formatPaymentMethod('paid_by_admin')).toBe('Paid by admin')
    expect(formatPaymentMethod('unknown_method')).toBe('unknown_method')
  })
})
