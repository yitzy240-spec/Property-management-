'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
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

interface RequestStayProps {
  properties: { id: string; name: string }[]
}

export function RequestStay({ properties }: RequestStayProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(properties.length === 1 ? properties[0].id : '')

  async function handleSubmit(formData: FormData) {
    setSubmitting(true)

    const checkIn = formData.get('check_in') as string
    const checkOut = formData.get('check_out') as string
    const notes = formData.get('notes') as string

    if (!selectedProperty || !checkIn || !checkOut) {
      toast.error('Please fill in all required fields')
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/owner/request-stay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: selectedProperty,
          check_in: checkIn,
          check_out: checkOut,
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to submit')
      }

      toast.success('Stay request submitted! Your manager has been notified.')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" className="w-full rounded-[var(--radius-button)]">
          <Calendar className="mr-1.5 h-4 w-4" />
          Request My Stay
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Request Personal Stay</DrawerTitle>
          <DrawerDescription>
            Block dates for your stay. Your property manager will be notified.
          </DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <form action={handleSubmit} className="space-y-4 p-4">
            {properties.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Property</Label>
                <NativeSelect
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value || '')}
                  placeholder="Select property"
                  className="h-11"
                  options={properties.map(p => ({ value: p.id, label: p.name }))}
                />
              </div>
            )}

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="check_in" className="text-xs font-medium">Check-in</Label>
                <Input id="check_in" name="check_in" type="date" required className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="check_out" className="text-xs font-medium">Check-out</Label>
                <Input id="check_out" name="check_out" type="date" required className="h-11" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs font-medium">Notes (optional)</Label>
              <Input id="notes" name="notes" placeholder="Any special requests..." className="h-11" />
            </div>

            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
