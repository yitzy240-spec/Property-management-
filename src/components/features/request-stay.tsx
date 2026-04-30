'use client'

import { useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * On mobile (especially Android Chrome and iOS Safari ≥16), tapping the
 * native calendar-icon affordance inside <input type="date"> doesn't reliably
 * open the date picker — only tapping into the text area does. Calling
 * `input.showPicker()` programmatically opens it cross-browser. We wrap the
 * input in a clickable container that delegates to showPicker() so taps
 * anywhere inside (including the icon) open the picker.
 */
function DateField({
  id,
  name,
  label,
  required,
  min,
}: {
  id: string
  name: string
  label: string
  required?: boolean
  min?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  function openPicker() {
    const el = ref.current
    if (!el) return
    try {
      el.showPicker?.()
      el.focus()
    } catch {
      el.focus()
    }
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      <div
        className="relative flex h-12 cursor-pointer items-center rounded-[var(--radius-button)] border border-input bg-background"
        onClick={openPicker}
      >
        <input
          ref={ref}
          id={id}
          name={name}
          type="date"
          required={required}
          min={min}
          onClick={(e) => {
            e.stopPropagation()
            openPicker()
          }}
          className="h-full w-full bg-transparent px-3 text-base outline-none [color-scheme:light] dark:[color-scheme:dark]"
          // 16px font-size prevents iOS Safari from zooming when the picker
          // opens (which can also cause the picker to never visually appear).
          style={{ fontSize: '16px' }}
        />
        <Calendar className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}
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
        <Button className="w-full rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
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
              <DateField
                id="check_in"
                name="check_in"
                label="Check-in"
                required
                min={new Date().toISOString().split('T')[0]}
              />
              <DateField
                id="check_out"
                name="check_out"
                label="Check-out"
                required
                min={new Date().toISOString().split('T')[0]}
              />
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
