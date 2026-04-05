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

export function BookingAddButton({ propertyId, propertyName }: { propertyId?: string; propertyName?: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [selectedProperty, setSelectedProperty] = useState(propertyId || '')
  const [currency, setCurrency] = useState<'ILS' | 'USD'>('ILS')
  const [fxRate, setFxRate] = useState('3.70')

  useEffect(() => {
    if (!open || propertyId) return
    fetch('/api/properties/list')
      .then(r => r.json())
      .then(data => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [open])

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    const propId = propertyId || selectedProperty
    if (!propId) { toast.error('Select a property'); setSaving(false); return }

    const grossStr = formData.get('gross_rental') as string
    const channelStr = formData.get('channel_fees') as string
    const depositStr = formData.get('deposit') as string

    let grossAgorot: number | null = null
    let originalCents: number | null = null
    let exchangeRate: number | null = null

    if (grossStr) {
      const amount = parseFloat(grossStr)
      if (currency === 'USD') {
        const rate = parseFloat(fxRate) || 3.70
        originalCents = Math.round(amount * 100)
        grossAgorot = Math.round(amount * rate * 100)
        exchangeRate = rate
      } else {
        grossAgorot = Math.round(amount * 100)
      }
    }

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propId,
          guest_name: formData.get('guest_name') as string || null,
          check_in: formData.get('check_in') as string,
          check_out: formData.get('check_out') as string,
          platform: formData.get('platform') as string || null,
          gross_rental_agorot: grossAgorot,
          channel_fees_agorot: channelStr ? Math.round(parseFloat(channelStr) * 100) : null,
          currency,
          original_amount_cents: originalCents,
          exchange_rate: exchangeRate,
          deposit_amount_agorot: depositStr ? Math.round(parseFloat(depositStr) * 100) : null,
          notes: formData.get('notes') as string || null,
        }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed')

      if (data.lodgify?.synced) {
        toast.success('Booking added + synced to Lodgify')
      } else if (data.lodgify?.error) {
        toast.success('Booking added locally (Lodgify sync failed)')
      } else {
        toast.success('Booking added')
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add booking')
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="h-3.5 w-3.5" />
          Add Booking
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Booking{propertyName ? ` — ${propertyName}` : ''}</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          <form action={handleSubmit} className="space-y-4 p-4">
            {!propertyId && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
                <Select value={selectedProperty} onValueChange={(v) => setSelectedProperty(v || '')}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Guest Name</Label>
              <Input name="guest_name" placeholder="John Smith" className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Check-in</Label>
                <Input name="check_in" type="date" required className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Check-out</Label>
                <Input name="check_out" type="date" required className="h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Platform</Label>
              <Select name="platform" defaultValue="">
                <SelectTrigger className="h-11"><SelectValue placeholder="Direct / Manual" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="airbnb">Airbnb</SelectItem>
                  <SelectItem value="booking">Booking.com</SelectItem>
                  <SelectItem value="lodgify">Lodgify</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Currency toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Currency</Label>
              <div className="flex gap-1">
                {(['ILS', 'USD'] as const).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`flex-1 rounded-[var(--radius-button)] py-2 text-sm font-medium transition-colors ${
                      currency === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {c === 'ILS' ? '₪ ILS' : '$ USD'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Gross Rental ({currency === 'USD' ? '$' : '₪'})
              </Label>
              <Input name="gross_rental" type="number" step="0.01" placeholder={currency === 'USD' ? '1,200.00' : '4,440.00'} className="h-11" />
            </div>

            {currency === 'USD' && (
              <div className="flex items-center gap-2 rounded-[10px] bg-muted/50 px-3 py-2">
                <span className="text-xs text-muted-foreground">× rate</span>
                <Input
                  value={fxRate}
                  onChange={e => setFxRate(e.target.value)}
                  type="number"
                  step="0.01"
                  className="h-8 w-20 text-center font-mono text-sm"
                />
                <span className="text-xs text-muted-foreground">= ₪{fxRate && parseFloat(fxRate) ? '...' : '0'}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Channel Fees (₪)</Label>
              <Input name="channel_fees" type="number" step="0.01" placeholder="225.00" className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deposit (₪)</Label>
              <Input name="deposit" type="number" step="0.01" placeholder="Optional" className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</Label>
              <textarea
                name="notes"
                className="min-h-[60px] w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. cash payment, monthly arrangement..."
                maxLength={500}
              />
            </div>

            <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Adding...' : 'Add Booking'}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
