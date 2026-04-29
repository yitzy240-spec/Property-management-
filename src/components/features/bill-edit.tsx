'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileText, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { updateBillStatus } from '@/app/(admin)/properties/actions'
import { BillForm, type BillFormValues } from './bill-form'
import type { Bill } from '@/types'

interface BillEditDrawerProps {
  /** The flagged or pending_review bill to edit. */
  bill: Bill & { properties?: { name: string } | null }
  /** Property name (passed for header display). */
  propertyName: string | null
  /** Optional trigger override; defaults to a small "Edit & Approve" button. */
  trigger?: React.ReactNode
}

/**
 * Drawer for editing a flagged/pending bill's fields and atomically
 * committing {edits + status + payment_method} via a single server-action call.
 *
 * Footer renders the four action buttons (Owner Paid Cash / Owner Paid CC /
 * Paid by Me / Reject). Each one submits the current form values together
 * with the chosen status + payment_method.
 */
export function BillEditDrawer({ bill, propertyName, trigger }: BillEditDrawerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [values, setValues] = useState<BillFormValues>({
    property_id: bill.property_id ?? '',
    bill_type: bill.bill_type,
    amount_agorot: bill.amount_agorot,
    due_date: bill.due_date ?? null,
    period_start: bill.billing_period_start ?? null,
    period_end: bill.billing_period_end ?? null,
  })

  useEffect(() => {
    if (!open || properties.length > 0) return
    fetch('/api/properties/list')
      .then((r) => r.json())
      .then((data) => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [open, properties.length])

  async function submit(status: 'approved' | 'rejected', paymentMethod?: string) {
    if (!values.property_id) {
      toast.error('Select a property')
      return
    }
    setLoading(paymentMethod ?? status)

    const result = await updateBillStatus(bill.id, status, paymentMethod, {
      amount_agorot: values.amount_agorot,
      due_date: values.due_date,
      bill_type: values.bill_type,
      property_id: values.property_id,
      period_start: values.period_start,
      period_end: values.period_end,
    })

    if (result.error) {
      toast.error('Failed to update bill', { description: result.error })
      setLoading(null)
      return
    }

    // Confirm the property mapping so future bills auto-match.
    if (status === 'approved' && values.property_id) {
      await fetch('/api/bills/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_id: bill.id,
          property_id: values.property_id,
          confirm_mapping: true,
        }),
      })
    }

    setLoading(null)
    setOpen(false)
    if (status === 'rejected') {
      toast.success('Bill rejected')
    } else {
      const labels: Record<string, string> = {
        paid_by_owner_cash: 'Marked as paid by owner (cash)',
        paid_by_owner_cc: 'Marked as paid by owner (CC)',
        paid_by_admin: 'Marked as paid by you',
      }
      toast.success(paymentMethod ? labels[paymentMethod] || 'Bill approved' : 'Bill approved')
    }
    router.refresh()
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-9 w-full gap-1.5 rounded-[var(--radius-button)]">
            <Pencil className="h-3.5 w-3.5" />
            Edit & Approve
          </Button>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit & Approve Bill</DrawerTitle>
          <DrawerDescription>
            Review the AI-extracted values, edit if needed, then choose how it was paid.
          </DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[70vh] overflow-y-auto px-4 pb-4">
          {/* Header summary: AI-extracted values + anomaly note + PDF link */}
          <div className="mb-4 space-y-2 rounded-[10px] border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  AI extracted (id: {bill.id.slice(0, 8)})
                </p>
                <p className="mt-1 text-sm font-medium">
                  {propertyName ?? 'No property assigned'}
                </p>
              </div>
              <CurrencyDisplay agorot={bill.amount_agorot} className="shrink-0 text-base font-bold" />
            </div>
            {bill.is_anomaly && bill.anomaly_note && (
              <p className="flex items-start gap-1 text-xs text-status-danger">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{bill.anomaly_note}</span>
              </p>
            )}
            {bill.pdf_storage_path && (
              <a
                href={`/api/download?path=${encodeURIComponent(bill.pdf_storage_path)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <FileText className="h-3 w-3" />
                View PDF
              </a>
            )}
          </div>

          <BillForm
            initial={{
              property_id: bill.property_id ?? '',
              bill_type: bill.bill_type,
              amount_agorot: bill.amount_agorot,
              due_date: bill.due_date,
              period_start: bill.billing_period_start,
              period_end: bill.billing_period_end,
            }}
            properties={properties}
            onChange={setValues}
            formIdPrefix="edit"
          />

          {/* Action buttons — atomic submit on each */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              className="h-10 text-xs text-status-safe hover:bg-[hsl(var(--status-safe)/0.08)]"
              onClick={() => submit('approved', 'paid_by_owner_cash')}
            >
              {loading === 'paid_by_owner_cash' ? 'Saving...' : 'Owner Paid (Cash)'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              className="h-10 text-xs text-status-safe hover:bg-[hsl(var(--status-safe)/0.08)]"
              onClick={() => submit('approved', 'paid_by_owner_cc')}
            >
              {loading === 'paid_by_owner_cc' ? 'Saving...' : 'Owner Paid (CC)'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              className="h-10 text-xs text-status-info hover:bg-[hsl(var(--status-info)/0.08)]"
              onClick={() => submit('approved', 'paid_by_admin')}
            >
              {loading === 'paid_by_admin' ? 'Saving...' : 'Paid by Me'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              className="h-10 text-xs text-status-danger hover:bg-[hsl(var(--status-danger)/0.08)]"
              onClick={() => submit('rejected')}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              {loading === 'rejected' ? 'Saving...' : 'Reject'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
