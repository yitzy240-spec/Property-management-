'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { createClient } from '@/lib/supabase/client'
import type { BillType } from '@/types'

export function BillAddButton({ preselectedPropertyId }: { preselectedPropertyId?: string } = {}) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [propertyId, setPropertyId] = useState(preselectedPropertyId || '')
  const [billType, setBillType] = useState<BillType>('other')

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

    const { error } = await supabase.from('bills').insert({
      property_id: propertyId,
      bill_type: billType,
      amount_agorot: amountAgorot,
      due_date: formData.get('due_date') as string || null,
      billing_period_start: formData.get('period_start') as string || null,
      billing_period_end: formData.get('period_end') as string || null,
      status: 'approved',
      is_anomaly: false,
    })

    if (error) {
      toast.error('Failed to add bill', { description: error.message })
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
          <form action={handleSubmit} className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
              <NativeSelect
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                placeholder="Select property"
                options={properties.map(p => ({ value: p.id, label: p.name }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bill Type</Label>
              <NativeSelect
                value={billType}
                onChange={(e) => setBillType(e.target.value as BillType)}
                options={[
                  { value: 'arnona', label: 'Arnona' },
                  { value: 'iec', label: 'Electricity (IEC)' },
                  { value: 'water', label: 'Water' },
                  { value: 'vaad_bayit', label: "Va'ad Bayit" },
                  { value: 'internet', label: 'Internet' },
                  { value: 'gas', label: 'Gas' },
                  { value: 'other', label: 'Other' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (ILS)</Label>
              <Input name="amount" type="number" step="0.01" placeholder="842.50" required className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Due Date</Label>
              <Input name="due_date" type="date" className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period Start</Label>
                <Input name="period_start" type="date" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period End</Label>
                <Input name="period_end" type="date" className="h-11" />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Adding...' : 'Add Bill'}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
