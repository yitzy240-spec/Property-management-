import type { BillStatus } from '@/types'

/**
 * Build status filter for bills query.
 * If statusParam is provided, parse it; otherwise exclude rejected bills.
 */
export function buildBillsStatusFilter(statusParam: string | null): {
  mode: 'explicit' | 'exclude_rejected'
  statuses?: string[]
} {
  if (statusParam) {
    return {
      mode: 'explicit',
      statuses: statusParam.split(',').map(s => s.trim()),
    }
  }
  return { mode: 'exclude_rejected' }
}

/**
 * Check if a bill can be edited based on its status.
 * Approved bills are locked and cannot be edited.
 */
export function canEditBill(status: BillStatus): boolean {
  return status !== 'approved'
}
