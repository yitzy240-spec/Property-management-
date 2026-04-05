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

  useEffect(() => {
    if (!open || propertyId) return
    supabase.from('properties').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setProperties(data ?? []))
  }, [open])

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    const propId = propertyId || selectedProperty
    if (!propId) { toast.error('Select a property'); setSaving(false); return }

    const grossStr = formData.get('gross_rental') as string
    const channelStr = formData.get('channel_fees') as string

    const { error } = await supabase.from('bookings').insert({
      property_id: propId,
      guest_name: formData.get('guest_name') as string || null,
      check_in: formData.get('check_in') as string,
      check_out: formData.get('check_out') as string,
      platform: formData.get('platform') as string || null,
      gross_rental_agorot: grossStr ? Math.round(parseFloat(grossStr) * 100) : null,
      channel_fees_agorot: channelStr ? Math.round(parseFloat(channelStr) * 100) : null,
    })

    if (error) {
      toast.error('Failed to add booking', { description: error.message })
    } else {
      toast.success('Booking added')
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gross Rental (ILS)</Label>
                <Input name="gross_rental" type="number" step="0.01" placeholder="1,500.00" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Channel Fees (ILS)</Label>
                <Input name="channel_fees" type="number" step="0.01" placeholder="225.00" className="h-11" />
              </div>
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
