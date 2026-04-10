'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { updateBillStatus } from '@/app/(admin)/properties/actions'
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

interface BillActionsProps {
  billId: string
  propertyId: string | null
  propertyName: string | null
  matchMethod: string | null
}

export function BillActions({ billId, propertyId, propertyName, matchMethod }: BillActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [doneAction, setDoneAction] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handlePayment(paymentMethod: string) {
    setLoading(paymentMethod)
    setError(null)

    const result = await updateBillStatus(billId, 'approved', paymentMethod)
    if (result.error) {
      setError(result.error)
      toast.error('Failed to update bill')
      setLoading(null)
      return
    }

    if ('approved' === 'approved' && propertyId) {
      await fetch('/api/bills/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill_id: billId, property_id: propertyId, confirm_mapping: true }),
      })
    }

    setDoneAction('approved')
    setLoading(null)
    const labels: Record<string, string> = {
      paid_by_owner_cash: 'Marked as paid by owner (cash)',
      paid_by_owner_cc: 'Marked as paid by owner (CC)',
      paid_by_admin: 'Marked as paid by you',
    }
    toast.success(labels[paymentMethod] || 'Bill approved')
    router.refresh()
  }

  async function handleAction(action: 'approved' | 'rejected') {
    setLoading(action)
    setError(null)

    const result = await updateBillStatus(billId, action)

    if (result.error) {
      setError(result.error)
      toast.error('Failed to update bill', { description: result.error })
      setLoading(null)
      return
    }

    // If approving and there's a property match, confirm the mapping for future use
    if (action === 'approved' && propertyId) {
      await fetch('/api/bills/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill_id: billId, property_id: propertyId, confirm_mapping: true }),
      })
    }

    setDoneAction(action)
    setLoading(null)
    toast.success(action === 'approved' ? 'Bill approved' : 'Bill rejected')
    router.refresh()
  }

  if (doneAction) {
    return (
      <StatusBadge
        status={doneAction === 'approved' ? 'safe' : 'danger'}
        label={doneAction === 'approved' ? 'Approved' : 'Rejected'}
        size="sm"
      />
    )
  }

  return (
    <div className="space-y-2">
      {/* Property assignment status */}
      {propertyId ? (
        <div className="flex items-center gap-2">
          <Building2 className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{propertyName || 'Unknown property'}</span>
          {matchMethod && (
            <StatusBadge
              status={matchMethod === 'learned_mapping' ? 'safe' : matchMethod === 'owner_name' ? 'info' : 'warning'}
              label={matchMethod === 'learned_mapping' ? 'Auto' : matchMethod === 'owner_name' ? 'Name match' : 'Address match'}
              size="sm"
            />
          )}
          <BillPropertyReassign billId={billId} currentPropertyName={propertyName} />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <StatusBadge status="warning" label="No property" size="sm" />
          <BillPropertyReassign billId={billId} currentPropertyName={null} />
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" className="h-9 text-xs text-status-safe hover:bg-[hsl(var(--status-safe)/0.08)]" disabled={loading !== null} onClick={() => handlePayment('paid_by_owner_cash')}>
          {loading === 'paid_by_owner_cash' ? 'Saving...' : 'Owner Paid (Cash)'}
        </Button>
        <Button size="sm" variant="outline" className="h-9 text-xs text-status-safe hover:bg-[hsl(var(--status-safe)/0.08)]" disabled={loading !== null} onClick={() => handlePayment('paid_by_owner_cc')}>
          {loading === 'paid_by_owner_cc' ? 'Saving...' : 'Owner Paid (CC)'}
        </Button>
        <Button size="sm" variant="outline" className="h-9 text-xs text-status-info hover:bg-[hsl(var(--status-info)/0.08)]" disabled={loading !== null} onClick={() => handlePayment('paid_by_admin')}>
          {loading === 'paid_by_admin' ? 'Saving...' : 'Paid by Me'}
        </Button>
        <Button size="sm" variant="outline" className="h-9 text-xs text-status-danger hover:bg-[hsl(var(--status-danger)/0.08)]" disabled={loading !== null} onClick={() => handleAction('rejected')}>
          <X className="mr-1 h-3.5 w-3.5" />
          {loading === 'rejected' ? 'Saving...' : 'Reject'}
        </Button>
      </div>
    </div>
  )
}

/** Inline property reassignment button with drawer picker */
function BillPropertyReassign({ billId, currentPropertyName }: { billId: string; currentPropertyName: string | null }) {
  const router = useRouter()
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function loadProperties() {
    if (properties.length > 0) return
    setLoading(true)
    const res = await fetch('/api/properties/list')
    if (res.ok) {
      const data = await res.json()
      setProperties(data.properties || [])
    }
    setLoading(false)
  }

  async function assignProperty(propertyId: string) {
    const res = await fetch('/api/bills/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill_id: billId, property_id: propertyId, confirm_mapping: true }),
    })

    if (res.ok) {
      toast.success('Property assigned — future bills from this sender will auto-match')
      setOpen(false)
      router.refresh()
    } else {
      toast.error('Failed to assign property')
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (v) loadProperties() }}>
      <DrawerTrigger asChild>
        <button className="text-xs font-medium text-primary hover:underline">
          {currentPropertyName ? 'Change' : 'Assign'}
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Assign Property</DrawerTitle>
          <DrawerDescription>
            Select the property this bill belongs to. Future bills from this sender will auto-match.
          </DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[50vh] overflow-y-auto p-4">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-1.5">
              {properties.map(p => (
                <button
                  key={p.id}
                  onClick={() => assignProperty(p.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="font-medium">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
