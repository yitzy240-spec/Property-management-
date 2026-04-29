'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { BillForm, type BillFormValues } from './bill-form'

export function BillAddButton({ preselectedPropertyId }: { preselectedPropertyId?: string } = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [values, setValues] = useState<BillFormValues>({
    property_id: preselectedPropertyId ?? '',
    bill_type: 'other',
    amount_agorot: 0,
    due_date: null,
    period_start: null,
    period_end: null,
  })

  useEffect(() => {
    if (!open) return
    fetch('/api/properties/list')
      .then((r) => r.json())
      .then((data) => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    if (!values.property_id) {
      toast.error('Select a property')
      setSaving(false)
      return
    }

    const res = await fetch('/api/bills/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: values.property_id,
        bill_type: values.bill_type,
        amount_agorot: values.amount_agorot,
        due_date: values.due_date,
        billing_period_start: values.period_start,
        billing_period_end: values.period_end,
        status: 'approved',
        is_anomaly: false,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      toast.error('Failed to add bill', { description: data.error })
    } else {
      toast.success('Bill added')
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-[var(--radius-button)]">
          <Plus className="h-3.5 w-3.5" />
          Add Bill
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Bill Manually</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <BillForm
              initial={{
                property_id: preselectedPropertyId ?? '',
                bill_type: 'other',
              }}
              properties={properties}
              onChange={setValues}
            />
            <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Adding...' : 'Add Bill'}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
