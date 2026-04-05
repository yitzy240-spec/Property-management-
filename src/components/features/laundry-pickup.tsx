'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

interface LaundryPickupProps {
  properties: { id: string; name: string; address: string }[]
  lowStockItems: { propertyName: string; itemName: string; quantity: number; parLevel: number }[]
}

export function LaundryPickupButton({ properties, lowStockItems }: LaundryPickupProps) {
  const [phone] = useState('972542326146')
  const [open, setOpen] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [pickupTime, setPickupTime] = useState('')

  function generateWhatsAppUrl() {
    const property = properties.find(p => p.id === selectedProperty)
    const propertyName = property?.name || 'הדירה'
    const address = property?.address || ''

    // Hebrew template from Marcus:
    // אשמח לאיסוף מ (דירה) כביסה מוכנה בשקיות.
    // צריך איסוף היום עד השעה y
    const lines = [
      `אשמח לאיסוף מ*${propertyName}*${address ? ' (' + address + ')' : ''} כביסה מוכנה בשקיות.`,
      pickupTime ? `צריך איסוף היום עד השעה *${pickupTime}*` : 'צריך איסוף היום',
    ]

    // Add low stock details if relevant
    const propertyLowStock = lowStockItems.filter(i => i.propertyName === propertyName)
    if (propertyLowStock.length > 0) {
      lines.push('')
      lines.push('פריטים חסרים:')
      for (const item of propertyLowStock) {
        lines.push(`• ${item.itemName}: ${item.quantity}/${item.parLevel}`)
      }
    }

    const message = encodeURIComponent(lines.join('\n'))
    const phoneNum = phone.replace(/\D/g, '')

    return `https://wa.me/${phoneNum}?text=${message}`
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <MessageCircle className="h-3 w-3" />
          Request Pickup
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Request Laundry Pickup</DrawerTitle>
          <DrawerDescription>
            Send Rafael&apos;s Dry Cleaning a WhatsApp message.
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Property</Label>
            <Select value={selectedProperty} onValueChange={(v) => setSelectedProperty(v || '')}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select property" /></SelectTrigger>
              <SelectContent>
                {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Pickup by (time)</Label>
            <Input
              type="time"
              value={pickupTime}
              onChange={e => setPickupTime(e.target.value)}
              className="h-11"
            />
          </div>

          {lowStockItems.length > 0 && (
            <div className="rounded-[10px] border border-status-warning/30 bg-[hsl(38_92%_50%/0.04)] p-3">
              <p className="text-xs font-semibold text-foreground">Low Stock ({lowStockItems.length})</p>
              {lowStockItems.map((item, i) => (
                <p key={i} className="mt-1 text-xs text-muted-foreground">
                  {item.propertyName} — {item.itemName}: {item.quantity}/{item.parLevel}
                </p>
              ))}
            </div>
          )}

          {/* Message preview */}
          {selectedProperty && (
            <div className="rounded-[10px] border border-border bg-muted/30 p-3" dir="rtl">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1" dir="ltr">Message Preview</p>
              <p className="text-sm text-foreground leading-relaxed">
                אשמח לאיסוף מ<strong>{properties.find(p => p.id === selectedProperty)?.name}</strong> כביסה מוכנה בשקיות.
              </p>
              <p className="text-sm text-foreground">
                {pickupTime ? `צריך איסוף היום עד השעה ${pickupTime}` : 'צריך איסוף היום'}
              </p>
            </div>
          )}
        </div>
        <DrawerFooter>
          {selectedProperty ? (
            <a href={generateWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="block">
              <Button className="h-11 w-full gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90">
                <MessageCircle className="h-4 w-4" />
                Send via WhatsApp
              </Button>
            </a>
          ) : (
            <Button disabled className="h-11 w-full">Select a property above</Button>
          )}
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
