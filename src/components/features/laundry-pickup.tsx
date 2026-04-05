'use client'

import { useState } from 'react'
import { Phone, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const [phone, setPhone] = useState('')
  const [open, setOpen] = useState(false)

  function generateWhatsAppUrl() {
    // Build a smart pickup message
    const lines = ['🧺 *Laundry Pickup Request*', `📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`, '']

    if (lowStockItems.length > 0) {
      lines.push('*Low Stock — Priority Pickup:*')
      // Group by property
      const byProperty = lowStockItems.reduce((acc, item) => {
        if (!acc[item.propertyName]) acc[item.propertyName] = []
        acc[item.propertyName].push(item)
        return acc
      }, {} as Record<string, typeof lowStockItems>)

      for (const [propName, items] of Object.entries(byProperty)) {
        lines.push(`\n📍 *${propName}*`)
        for (const item of items) {
          lines.push(`  • ${item.itemName}: ${item.quantity}/${item.parLevel} (need ${item.parLevel - item.quantity} more)`)
        }
      }
    } else {
      lines.push('*Pickup locations:*')
      for (const p of properties) {
        lines.push(`📍 ${p.name} — ${p.address}`)
      }
    }

    lines.push('', 'Sent via ApartmentOS — Marcus Properties')

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
            Send a WhatsApp message to your laundry service with pickup details.
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Laundry Service Phone</Label>
            <Input
              type="tel"
              placeholder="972501234567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="h-11 font-mono"
            />
            <p className="text-[10px] text-muted-foreground">Include country code, no + or dashes</p>
          </div>

          {lowStockItems.length > 0 && (
            <div className="rounded-[10px] border border-status-warning/30 bg-[hsl(38_92%_50%/0.04)] p-3">
              <p className="text-xs font-semibold text-foreground">Low Stock Items ({lowStockItems.length})</p>
              {lowStockItems.map((item, i) => (
                <p key={i} className="mt-1 text-xs text-muted-foreground">
                  {item.propertyName} — {item.itemName}: {item.quantity}/{item.parLevel}
                </p>
              ))}
            </div>
          )}

          <div className="rounded-[10px] border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Pickup Locations</p>
            {properties.map(p => (
              <p key={p.id} className="mt-1 text-xs text-muted-foreground">{p.name} — {p.address}</p>
            ))}
          </div>
        </div>
        <DrawerFooter>
          {phone ? (
            <a href={generateWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="block">
              <Button className="h-11 w-full gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90">
                <MessageCircle className="h-4 w-4" />
                Send via WhatsApp
              </Button>
            </a>
          ) : (
            <Button disabled className="h-11 w-full">Enter phone number above</Button>
          )}
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
