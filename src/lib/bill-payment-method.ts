/**
 * Bill Payment Method Constants
 * 
 * Shared constants for bill payment_method field values across the codebase.
 * This field tracks who paid the bill and how (used in statements and admin UI).
 * 
 * Production data: 170 rows with 'paid_by_owner_cc', 249 rows with null
 */

export const BILL_PAYMENT_METHODS = {
  /** Bill not yet paid or payment method not recorded (249 rows in prod) */
  UNSET: null,
  /** Owner paid by cash */
  PAID_BY_OWNER_CASH: 'paid_by_owner_cash',
  /** Owner paid by credit card (170 rows in prod) */
  PAID_BY_OWNER_CC: 'paid_by_owner_cc',
  /** Admin (Marcus Properties) paid on owner's behalf */
  PAID_BY_ADMIN: 'paid_by_admin',
} as const

export type BillPaymentMethod = typeof BILL_PAYMENT_METHODS[keyof typeof BILL_PAYMENT_METHODS]

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  paid_by_owner_cash: 'Owner paid (Cash)',
  paid_by_owner_cc: 'Owner paid (Credit Card)',
  paid_by_admin: 'Paid by admin',
}

/** For dropdowns and UI selection */
export const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: BILL_PAYMENT_METHODS.PAID_BY_OWNER_CASH, label: PAYMENT_METHOD_LABELS.paid_by_owner_cash },
  { value: BILL_PAYMENT_METHODS.PAID_BY_OWNER_CC, label: PAYMENT_METHOD_LABELS.paid_by_owner_cc },
  { value: BILL_PAYMENT_METHODS.PAID_BY_ADMIN, label: PAYMENT_METHOD_LABELS.paid_by_admin },
]

export function formatPaymentMethod(method: string | null): string {
  if (!method) return 'Not set'
  return PAYMENT_METHOD_LABELS[method] ?? method
}
