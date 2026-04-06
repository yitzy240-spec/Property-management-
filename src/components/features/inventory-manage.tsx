'use client'

import { useState, useEffect } from 'react'
import { Plus, Minus, RotateCcw } from 'lucide-react'
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

/** Add a new inventory item */
export function InventoryAddButton() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [propertyId, setPropertyId] = useState('')

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

    const { error } = await supabase.from('inventory_items').insert({
      property_id: propertyId,
      item_name: formData.get('item_name') as string,
      quantity_in_closet: Number(formData.get('quantity') || 0),
      quantity_at_laundry: 0,
      quantity_damaged: 0,
      par_level: Number(formData.get('par_level') || 0) || null,
    })

    if (error) {
      toast.error('Failed to add', { description: error.message })
    } else {
      toast.success('Item added')
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="h-3.5 w-3.5" />
          Add Item
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Inventory Item</DrawerTitle>
        </DrawerHeader>
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
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item Name</Label>
            <Input name="item_name" placeholder="Bath Towels" required className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quantity</Label>
              <Input name="quantity" type="number" defaultValue="0" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Par Level</Label>
              <Input name="par_level" type="number" placeholder="Min safe stock" className="h-11" />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? 'Adding...' : 'Add Item'}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  )
}

/** Inline count adjuster for inventory items */
export function InventoryAdjust({ itemId, field, currentValue }: {
  itemId: string
  field: 'quantity_in_closet' | 'quantity_at_laundry' | 'quantity_damaged'
  currentValue: number
}) {
  const supabase = createClient()
  const router = useRouter()

  async function adjust(delta: number) {
    const newVal = Math.max(0, currentValue + delta)
    const { error } = await supabase
      .from('inventory_items')
      .update({ [field]: newVal, last_counted_at: new Date().toISOString() })
      .eq('id', itemId)

    if (error) {
      toast.error('Update failed')
    } else {
      router.refresh()
    }
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button onClick={() => adjust(-1)} className="rounded p-0.5 hover:bg-muted" aria-label="Decrease">
        <Minus className="h-3 w-3 text-muted-foreground" />
      </button>
      <span className="min-w-[20px] text-center font-mono text-sm">{currentValue}</span>
      <button onClick={() => adjust(1)} className="rounded p-0.5 hover:bg-muted" aria-label="Increase">
        <Plus className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  )
}

/** Create a laundry batch */
export function LaundryBatchButton() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [propertyId, setPropertyId] = useState('')

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

    const itemsRaw = formData.get('items') as string
    const items = itemsRaw.split('\n').map(line => {
      const parts = line.trim().split(/[x×:]\s*/i)
      return {
        item_name: parts[0]?.trim() || line.trim(),
        quantity: parseInt(parts[1]) || 1,
      }
    }).filter(i => i.item_name)

    const { error } = await supabase.from('laundry_batches').insert({
      property_id: propertyId,
      items,
      sent_at: new Date().toISOString(),
      laundry_provider_notified: false,
    })

    if (error) {
      toast.error('Failed to create batch', { description: error.message })
    } else {
      toast.success('Laundry batch created')
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
          New Batch
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Create Laundry Batch</DrawerTitle>
        </DrawerHeader>
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
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Items (one per line, e.g. "Bath Towels x 4")</Label>
            <textarea
              name="items"
              className="min-h-[100px] w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder={"Bath Towels x 4\nBed Sheets x 2\nPillow Cases x 4"}
              required
            />
          </div>
          <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? 'Creating...' : 'Create Batch'}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  )
}

/** Mark a laundry batch as returned */
export function LaundryReturnButton({ batchId }: { batchId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleReturn() {
    setLoading(true)
    const { error } = await supabase
      .from('laundry_batches')
      .update({ returned_at: new Date().toISOString() })
      .eq('id', batchId)

    if (error) {
      toast.error('Update failed')
    } else {
      toast.success('Batch marked as returned')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleReturn} disabled={loading}>
      <RotateCcw className="h-3 w-3" />
      {loading ? '...' : 'Returned'}
    </Button>
  )
}
