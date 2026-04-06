'use client'

import { useState, useEffect } from 'react'
import { Plus, Camera, Sparkles } from 'lucide-react'
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
import { NativeSelect } from '@/components/ui/native-select'
import { createClient } from '@/lib/supabase/client'
import type { TaskPriority } from '@/types'

export function TaskCreateDialog({ preselectedPropertyId, preselectedPropertyName }: { preselectedPropertyId?: string; preselectedPropertyName?: string } = {}) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [contractors, setContractors] = useState<{ id: string; name: string }[]>([])
  const [propertyId, setPropertyId] = useState(preselectedPropertyId || '')
  const [contractorId, setContractorId] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [titleVal, setTitleVal] = useState('')
  const [descVal, setDescVal] = useState('')
  const [checklistVal, setChecklistVal] = useState('')

  async function handlePhotoAnalyze(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setAnalyzing(true)
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          resolve(dataUrl.split(',')[1])
        }
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/ai/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, mime_type: file.type }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.title) setTitleVal(data.title)
        if (data.description) setDescVal(data.description)
        if (data.priority) setPriority(data.priority as TaskPriority)
        if (data.checklist?.length) setChecklistVal(data.checklist.join('\n'))
        toast.success('AI analyzed the photo')
      }
    } catch {
      toast.error('Photo analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    if (!open) return
    fetch('/api/properties/list')
      .then(r => r.json())
      .then(data => setProperties(data.properties ?? []))
      .catch(() => {})
    fetch('/api/contractors/list')
      .then(r => r.json())
      .then(data => setContractors(data.contractors ?? []))
      .catch(() => {})
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
      {/* Snap-to-Task: AI photo analysis */}
      <div className="rounded-[10px] border border-dashed border-accent/40 bg-accent/5 p-3">
        <label className="flex cursor-pointer items-center justify-center gap-2 text-sm font-medium text-foreground">
          {analyzing ? (
            <><Sparkles className="h-4 w-4 animate-pulse text-accent" /> AI analyzing photo...</>
          ) : (
            <><Camera className="h-4 w-4 text-accent" /> Snap a photo — AI fills the form</>
          )}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoAnalyze} disabled={analyzing} />
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Task Title</Label>
        <Input id="title" name="title" placeholder="Fix boiler pilot light" required className="h-11" value={titleVal} onChange={e => setTitleVal(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
        <Input id="description" name="description" placeholder="Optional details..." className="h-11" value={descVal} onChange={e => setDescVal(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
        <NativeSelect
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          placeholder="Select property"
          required
          options={properties.map(p => ({ value: p.id, label: p.name }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority</Label>
        <NativeSelect
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' },
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contractor</Label>
        <NativeSelect
          value={contractorId}
          onChange={(e) => setContractorId(e.target.value)}
          placeholder="Unassigned (optional)"
          options={contractors.map(c => ({ value: c.id, label: c.name }))}
        />
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
          value={checklistVal}
          onChange={e => setChecklistVal(e.target.value)}
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
