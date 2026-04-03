'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import type { TaskPriority } from '@/types'

export function TaskCreateDialog() {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [priority, setPriority] = useState<TaskPriority>('normal')

  async function handleCreate(formData: FormData) {
    setSaving(true)

    const title = formData.get('title') as string
    const description = formData.get('description') as string || null
    const propertyId = formData.get('property_id') as string
    const contractorId = formData.get('contractor_id') as string || null
    const dueDate = formData.get('due_date') as string || null
    const checklistRaw = formData.get('checklist_items') as string

    // Create the task
    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        property_id: propertyId,
        contractor_id: contractorId || null,
        priority,
        status: 'pending',
        due_date: dueDate || null,
      })
      .select('id')
      .single()

    if (!error && task && checklistRaw) {
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
    window.location.reload()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        <Plus className="h-4 w-4" />
        New Task
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form action={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input id="title" name="title" placeholder="Fix boiler pilot light" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="Optional details..." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="property_id">Property ID</Label>
              <Input id="property_id" name="property_id" placeholder="Property UUID" required />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contractor_id">Contractor ID (optional)</Label>
              <Input id="contractor_id" name="contractor_id" placeholder="UUID" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="checklist_items">Checklist Items (one per line, optional)</Label>
            <textarea
              id="checklist_items"
              name="checklist_items"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={"Check boiler ignition\nTest thermostat\nVerify gas connection"}
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Creating...' : 'Create Task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
