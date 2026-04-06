'use client'

import { useState, useEffect } from 'react'
import { Plus, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { createClient } from '@/lib/supabase/client'

interface WorkLogEntry {
  id: string
  property_id: string
  date: string
  hours: number
  description: string
  billable: boolean
  invoiced: boolean
  properties?: { name: string }
}

export function WorkLogButton({ preselectedPropertyId }: { preselectedPropertyId?: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [propertyId, setPropertyId] = useState(preselectedPropertyId || '')

  useEffect(() => {
    if (!open || preselectedPropertyId) return
    fetch('/api/properties/list')
      .then(r => r.json())
      .then(data => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [open, preselectedPropertyId])

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    const propId = preselectedPropertyId || propertyId
    if (!propId) { toast.error('Select a property'); setSaving(false); return }

    const hours = parseFloat(formData.get('hours') as string)
    if (!hours || hours <= 0) { toast.error('Enter valid hours'); setSaving(false); return }

    const { error } = await supabase.from('work_logs').insert({
      property_id: propId,
      date: formData.get('date') as string || new Date().toISOString().split('T')[0],
      hours,
      description: formData.get('description') as string || 'Billable work',
      billable: true,
    })

    if (error) {
      toast.error('Failed to log hours', { description: error.message })
    } else {
      toast.success(`${hours}h logged`)
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Clock className="h-3 w-3" />
          Log Hours
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Billable Hours</DrawerTitle>
        </DrawerHeader>
        <form action={handleSubmit} className="space-y-4 p-4">
          {!preselectedPropertyId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
              <NativeSelect
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                placeholder="Select property"
                options={properties.map(p => ({ value: p.id, label: p.name }))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hours</Label>
              <Input name="hours" type="number" step="0.25" min="0.25" placeholder="2.5" required className="h-11 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</Label>
              <Input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
            <Input name="description" placeholder="Guest coordination, cleaning oversight..." required className="h-11" />
          </div>
          <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? 'Logging...' : 'Log Hours'}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  )
}

/** Display work log entries for a property or all properties */
export function WorkLogList({ propertyId }: { propertyId?: string }) {
  const supabase = createClient()
  const [entries, setEntries] = useState<WorkLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      let query = supabase
        .from('work_logs')
        .select('*, properties(name)')
        .eq('billable', true)
        .order('date', { ascending: false })
        .limit(20)

      if (propertyId) {
        query = query.eq('property_id', propertyId)
      }

      const { data } = await query
      setEntries((data as WorkLogEntry[]) ?? [])
      setLoading(false)
    }
    load()
  }, [propertyId, supabase])

  if (loading) return null
  if (entries.length === 0) return null

  const totalHours = entries.filter(e => !e.invoiced).reduce((s, e) => s + Number(e.hours), 0)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Work Log
        </p>
        {totalHours > 0 && (
          <span className="font-mono text-xs text-muted-foreground">{totalHours}h uninvoiced</span>
        )}
      </div>
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
        {entries.map((entry, i) => (
          <div key={entry.id} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{entry.description}</p>
              <p className="text-[10px] text-muted-foreground">
                {!propertyId && entry.properties?.name ? entry.properties.name + ' · ' : ''}{entry.date}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{entry.hours}h</span>
              {entry.invoiced && (
                <span className="rounded-[var(--radius-badge)] bg-status-safe/15 px-1.5 py-0.5 text-[10px] font-medium text-status-safe">Invoiced</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
