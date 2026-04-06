'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { createClient } from '@/lib/supabase/client'
import type { FeeType } from '@/types'

export function FeeEntryAddButton() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [feeType, setFeeType] = useState<FeeType>('commission')

  useEffect(() => {
    if (!open) return
    fetch('/api/properties/list')
      .then(r => r.json())
      .then(data => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [open])

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    if (!propertyId) { toast.error('Select a property'); setSaving(false); return }

    const amountStr = formData.get('amount') as string
    const amountAgorot = amountStr ? Math.round(parseFloat(amountStr) * 100) : 0

    // Default billing month to current month
    const now = new Date()
    const billingMonth = formData.get('billing_month') as string ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const { error } = await supabase.from('fee_entries').insert({
      property_id: propertyId,
      fee_type: feeType,
      amount_agorot: amountAgorot,
      description: formData.get('description') as string || null,
      billing_month: billingMonth,
      pushed_to_invoice: false,
    })

    if (error) {
      toast.error('Failed to add', { description: error.message })
    } else {
      toast.success('Fee entry added')
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
          Add Fee
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Fee Entry</DrawerTitle>
        </DrawerHeader>
        <form action={handleSubmit} className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
            <Select value={propertyId} onValueChange={(v) => setPropertyId(v || '')}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select property" /></SelectTrigger>
              <SelectContent>
                {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fee Type</Label>
            <Select value={feeType} onValueChange={(v) => setFeeType(v as FeeType)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="commission">Commission</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (ILS)</Label>
            <Input name="amount" type="number" step="0.01" placeholder="500.00" required className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
            <Input name="description" placeholder="Monthly management fee" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billing Month</Label>
            <Input name="billing_month" type="month" className="h-11" />
          </div>
          <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? 'Adding...' : 'Add Fee Entry'}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
