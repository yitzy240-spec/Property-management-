'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { formatILS } from '@/lib/utils'

interface RecordPaymentDialogProps {
  statementId: string
  ownerName: string
  remainingAgorot: number
}

export function RecordPaymentDialog({ statementId, ownerName, remainingAgorot }: RecordPaymentDialogProps) {
  const router = useRouter()
  const [recording, setRecording] = useState(false)
  const [method, setMethod] = useState('bank_transfer')
  const [amountILS, setAmountILS] = useState((remainingAgorot / 100).toFixed(2))
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState('')

  const surchargeNote = method === 'credit_card'
    ? ` + 3.5% CC fee (${formatILS(Math.round(parseFloat(amountILS) * 100 * 0.035))})`
    : ''

  async function handleRecord() {
    setRecording(true)
    try {
      const res = await fetch(`/api/statements/${statementId}/record-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_agorot: Math.round(parseFloat(amountILS) * 100),
          payment_method: method,
          payment_date: date,
          reference: reference || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record payment')

      toast.success(data.message)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setRecording(false)
    }
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <CreditCard className="h-3 w-3" />
          Record
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Record Payment</DrawerTitle>
          <DrawerDescription>
            Record a payment from {ownerName}. Remaining: {formatILS(remainingAgorot)}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount (ILS)</label>
            <input
              type="number"
              step="0.01"
              value={amountILS}
              onChange={e => setAmountILS(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {surchargeNote && (
              <p className="mt-1 text-xs text-status-warning">{surchargeNote}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="credit_card">Credit Card (+ 3.5% fee)</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Payment Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Reference (optional)</label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Transfer ref, check #, etc."
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DrawerFooter>
          <Button
            onClick={handleRecord}
            disabled={recording || !amountILS || parseFloat(amountILS) <= 0}
            className="h-11 w-full"
          >
            {recording ? 'Recording...' : `Record Payment — ${formatILS(Math.round(parseFloat(amountILS || '0') * 100))}${surchargeNote}`}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
