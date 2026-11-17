'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileText, Pencil, Upload, X } from 'lucide-react'
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
import { BillForm, type BillFormValues } from './bill-form'
import type { Bill } from '@/types'

interface BillEditFullDrawerProps {
  bill: Bill & { properties?: { name: string } | null }
  propertyName: string | null
  trigger?: React.ReactNode
}

/**
 * Full bill edit drawer - allows editing all fields AND replacing the PDF.
 * Does NOT change status or payment_method (use BillEditDrawer for approval flow).
 */
export function BillEditFullDrawer({ bill, propertyName, trigger }: BillEditFullDrawerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  async function submit() {
    if (loading) return
    if (!values.property_id) {
      toast.error('Select a property')
      return
    }
    if (values.amount_agorot == null || values.amount_agorot <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }
    setLoading(true)

    try {
      // Update bill fields
      const res = await fetch(`/api/bills/${bill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_agorot: values.amount_agorot,
          due_date: values.due_date,
          bill_type: values.bill_type,
          property_id: values.property_id,
          billing_period_start: values.period_start,
          billing_period_end: values.period_end,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to update bill')
      }

      // If a new PDF was selected, upload it
      if (pdfFile) {
        const formData = new FormData()
        formData.append('file', pdfFile)
        formData.append('replace', 'true')

        const pdfRes = await fetch(`/api/bills/${bill.id}/pdf`, {
          method: 'POST',
          body: formData,
        })

        if (!pdfRes.ok) {
          const body = await pdfRes.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to upload PDF')
        }
      }

      toast.success('Bill updated')
      setOpen(false)
      setPdfFile(null)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-[var(--radius-button)]">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit Bill</DrawerTitle>
          <DrawerDescription>
            Update bill fields and optionally replace the PDF attachment.
          </DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[70vh] overflow-y-auto px-4 pb-4">
          {/* Current bill summary */}
          <div className="mb-4 space-y-2 rounded-[10px] border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Current Bill (id: {bill.id.slice(0, 8)})
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
                View Current PDF
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
            formIdPrefix="edit-full"
          />

          {/* PDF Upload */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Replace PDF (optional)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {pdfFile ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs">
                  {pdfFile.name}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPdfFile(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Choose File
              </Button>
            )}
          </div>

          {/* Submit button */}
          <div className="mt-5">
            <Button
              size="sm"
              className="h-10 w-full"
              disabled={loading}
              onClick={submit}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
