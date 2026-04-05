'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
} from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import type { TaskPriority } from '@/types'

export function TaskCreateDialog() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [contractors, setContractors] = useState<{ id: string; name: string }[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [contractorId, setContractorId] = useState('')

  useEffect(() => {
    if (!open) return
    supabase.from('properties').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setProperties(data ?? []))
    supabase.from('contractors').select('id, name').order('name')
      .then(({ data }) => setContractors(data ?? []))
  }, [open])

  async function handleCreate(formData: FormData) {
    setSaving(true)

    const title = formData.get('title') as string
    const description = formData.get('description') as string || null
    const dueDate = formData.get('due_date') as string || null
    const checklistRaw = formData.get('checklist_items') as string

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        property_id: propertyId || null,
        contractor_id: contractorId || null,
        priority,
        status: 'pending',
        due_date: dueDate || null,
      })
      .select('id')
      .single()

    if (error) {
      toast.error('Failed to create task', { description: error.message })
      setSaving(false)
      return
    }

    if (task && checklistRaw) {
      const items = checklistRaw.split('\n').map(s => s.trim()).filter(Boolean)
      if (items.length > 0) {
        await supabase.from('task_checklist_items').insert(
          items.map((label, index) => ({
            task_id: task.id,
            label,
            sort_order: index,
          }))
        )
      }
    }

    setSaving(false)
    setOpen(false)
    setPropertyId('')
    setContractorId('')
    setPriority('normal')
    toast.success('Task created')
    router.refresh()
  }

  const formContent = (
    <form action={handleCreate} className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Task Title</Label>
        <Input id="title" name="title" placeholder="Fix boiler pilot light" required className="h-11" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
        <Input id="description" name="description" placeholder="Optional details..." className="h-11" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
        <Select value={propertyId} onValueChange={(v) => setPropertyId(v || '')} required>
          <SelectTrigger className="h-11"><SelectValue placeholder="Select property" /></SelectTrigger>
          <SelectContent>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority</Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contractor</Label>
        <Select value={contractorId} onValueChange={(v) => setContractorId(v || '')}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Unassigned (optional)" /></SelectTrigger>
          <SelectContent>
            {contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="due_date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Due Date</Label>
        <Input id="due_date" name="due_date" type="date" className="h-11" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="checklist_items" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checklist (one per line)</Label>
        <textarea
          id="checklist_items"
          name="checklist_items"
          className="flex min-h-[80px] w-full rounded-[var(--radius-button)] border border-input bg-background px-3 py-2 text-sm"
          placeholder={"Check boiler ignition\nTest thermostat\nVerify gas connection"}
        />
      </div>

      <Button type="submit" className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={saving}>
        {saving ? 'Creating...' : 'Create Task'}
      </Button>
    </form>
  )

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="h-3.5 w-3.5" />
          New Task
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Create Task</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          {formContent}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
