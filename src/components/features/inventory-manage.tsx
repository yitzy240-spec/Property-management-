'use client'

import { useState, useEffect } from 'react'
import { Plus, Minus, RotateCcw, Trash2, Pencil } from 'lucide-react'
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
    const updates: Record<string, unknown> = {
      [field]: newVal,
      last_counted_at: new Date().toISOString(),
    }

    // When marking as damaged (+1), auto-deduct from closet
    if (field === 'quantity_damaged' && delta > 0) {
      // Fetch current closet count to deduct
      const { data: item } = await supabase
        .from('inventory_items')
        .select('quantity_in_closet')
        .eq('id', itemId)
        .single()
      if (item) {
        updates.quantity_in_closet = Math.max(0, item.quantity_in_closet - delta)
      }
    }

    const { error } = await supabase
      .from('inventory_items')
      .update(updates)
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

/** Delete an inventory item */
export function InventoryDeleteButton({ itemId }: { itemId: string }) {
  const supabase = createClient()
  const router = useRouter()

  async function handleDelete() {
    if (!confirm('Delete this inventory item?')) return
    const { error } = await supabase.from('inventory_items').delete().eq('id', itemId)
    if (error) {
      toast.error('Delete failed')
    } else {
      router.refresh()
    }
  }

  return (
    <button onClick={handleDelete} className="rounded p-1 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10" aria-label="Delete">
      <Trash2 className="h-3 w-3" />
    </button>
  )
}

/** Create a laundry batch — pre-populates with property inventory */
export function LaundryBatchButton() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [itemsText, setItemsText] = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/properties/list')
      .then(r => r.json())
      .then(data => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [open])

  // When property changes, pre-populate with inventory items
  async function handlePropertyChange(pid: string) {
    setPropertyId(pid)
    if (!pid) { setItemsText(''); return }

    const { data } = await supabase
      .from('inventory_items')
      .select('item_name, quantity_in_closet')
      .eq('property_id', pid)
      .order('item_name')

    if (data && data.length > 0) {
      setItemsText(data.map(i => `${i.item_name} x ${i.quantity_in_closet}`).join('\n'))
    } else {
      // Default template if no inventory
      setItemsText('Bath Towels x 4\nHand Towels x 4\nBed Sheets x 2\nPillow Cases x 4\nDuvet Covers x 2')
    }
  }

  async function handleSubmit() {
    setSaving(true)
    if (!propertyId) { toast.error('Select a property'); setSaving(false); return }

    const items = itemsText.split('\n').map(line => {
      const parts = line.trim().split(/\s*[x×:]\s*/i)
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
      setSaving(false)
      return
    }

    // Auto-update inventory: closet → laundry
    for (const item of items) {
      const { data: invItem } = await supabase
        .from('inventory_items')
        .select('id, quantity_in_closet, quantity_at_laundry')
        .eq('property_id', propertyId)
        .ilike('item_name', item.item_name)
        .single()

      if (invItem) {
        await supabase.from('inventory_items').update({
          quantity_in_closet: Math.max(0, invItem.quantity_in_closet - item.quantity),
          quantity_at_laundry: invItem.quantity_at_laundry + item.quantity,
          last_counted_at: new Date().toISOString(),
        }).eq('id', invItem.id)
      }
    }

    toast.success('Laundry batch created — inventory updated')
    setOpen(false)
    setItemsText('')
    setPropertyId('')
    router.refresh()
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setItemsText(''); setPropertyId('') } }}>
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
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
            <NativeSelect
              value={propertyId}
              onChange={(e) => handlePropertyChange(e.target.value)}
              placeholder="Select property"
              options={properties.map(p => ({ value: p.id, label: p.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Items (one per line, e.g. "Bath Towels x 4")</Label>
            <textarea
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              className="min-h-[140px] w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder={"Bath Towels x 4\nBed Sheets x 2\nPillow Cases x 4"}
              required
            />
            <p className="text-[10px] text-muted-foreground">Pre-filled from property inventory. Adjust quantities as needed.</p>
          </div>
          <Button onClick={handleSubmit} disabled={saving || !itemsText.trim()} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? 'Creating...' : 'Create Batch & Update Inventory'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/** Mark a laundry batch as returned — auto-updates inventory */
export function LaundryReturnButton({ batchId, propertyId, items }: {
  batchId: string
  propertyId: string
  items: { item_name: string; quantity: number }[]
}) {
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
      setLoading(false)
      return
    }

    // Auto-update inventory: laundry → closet
    for (const item of items) {
      const { data: invItem } = await supabase
        .from('inventory_items')
        .select('id, quantity_in_closet, quantity_at_laundry')
        .eq('property_id', propertyId)
        .ilike('item_name', item.item_name)
        .single()

      if (invItem) {
        await supabase.from('inventory_items').update({
          quantity_in_closet: invItem.quantity_in_closet + item.quantity,
          quantity_at_laundry: Math.max(0, invItem.quantity_at_laundry - item.quantity),
          last_counted_at: new Date().toISOString(),
        }).eq('id', invItem.id)
      }
    }

    toast.success('Batch returned — inventory updated')
    router.refresh()
    setLoading(false)
  }

  return (
    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleReturn} disabled={loading}>
      <RotateCcw className="h-3 w-3" />
      {loading ? '...' : 'Returned'}
    </Button>
  )
}

/** Edit a laundry batch — adjust item quantities */
export function LaundryEditButton({ batchId, items: initialItems }: {
  batchId: string
  items: { item_name: string; quantity: number }[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState(initialItems)

  function updateQuantity(index: number, delta: number) {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
    ))
  }

  async function handleSave() {
    setSaving(true)
    const nonZero = items.filter(i => i.quantity > 0)
    const { error } = await supabase
      .from('laundry_batches')
      .update({ items: nonZero })
      .eq('id', batchId)

    if (error) {
      toast.error('Save failed')
    } else {
      toast.success('Batch updated')
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit Laundry Batch</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-2 p-4">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm font-medium">{item.item_name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => updateQuantity(i, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-mono text-lg font-bold">{item.quantity}</span>
                <button onClick={() => updateQuantity(i, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4">
          <Button onClick={handleSave} disabled={saving} className="h-11 w-full">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
