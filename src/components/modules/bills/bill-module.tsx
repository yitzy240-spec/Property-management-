'use client'

import { AlertTriangle, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { DateDisplay } from '@/components/ui/date-display'
import { StatusBadge } from '@/components/ui/status-badge'
import { useBills, useBillAction } from './use-bills'
import type { BillStatus } from '@/types'

const billTypeLabels: Record<string, string> = {
  arnona: 'Arnona',
  iec: 'Electricity (IEC)',
  water: 'Water',
  vaad_bayit: "Va'ad Bayit",
  internet: 'Internet',
  gas: 'Gas',
  other: 'Other',
}

interface BillModuleProps {
  propertyId?: string
  status?: BillStatus
  limit?: number
  variant?: 'compact' | 'full'
  showActions?: boolean
}

/**
 * Self-contained bill display module.
 * Fetches its own data, renders token-driven UI.
 * No layout opinions — no padding, no card wrapper, no navigation.
 */
export function BillModule({
  propertyId,
  status,
  limit,
  variant = 'full',
  showActions = true,
}: BillModuleProps) {
  const { data: bills, isLoading } = useBills({ propertyId, status, limit })
  const billAction = useBillAction()

  if (isLoading) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Loading bills...</p>
  }

  if (!bills || bills.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No bills</p>
  }

  return (
    <div className="space-y-2">
      {bills.map((bill) => (
        <Card key={bill.id}>
          <CardContent className={variant === 'compact' ? 'p-3' : 'p-4'}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {billTypeLabels[bill.bill_type] || bill.bill_type}
                  </span>
                  {bill.is_anomaly && (
                    <StatusBadge status="danger" label="High" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(bill.properties as { name: string } | null)?.name}
                  {bill.due_date && (
                    <> · Due <DateDisplay date={bill.due_date} format="short" className="inline text-xs" /></>
                  )}
                </p>
                {bill.anomaly_note && (
                  <p className="mt-1 text-xs text-status-danger">{bill.anomaly_note}</p>
                )}
              </div>
              <div className="text-right">
                <CurrencyDisplay agorot={bill.amount_agorot} variant="default" className="text-sm font-semibold" />
                <div className="mt-1">
                  <StatusBadge status={bill.status} />
                </div>
              </div>
            </div>

            {showActions && (bill.status === 'pending_review' || bill.status === 'flagged') && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-status-safe hover:bg-status-safe/10"
                  disabled={billAction.isPending}
                  onClick={() => billAction.mutate({ billId: bill.id, action: 'approved' })}
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-status-danger hover:bg-status-danger/10"
                  disabled={billAction.isPending}
                  onClick={() => billAction.mutate({ billId: bill.id, action: 'rejected' })}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
