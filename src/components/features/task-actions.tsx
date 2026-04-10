'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Play, CheckCircle2, XCircle, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import type { TaskStatus, TaskPriority } from '@/types'

interface TaskActionsProps {
  taskId: string
  propertyId: string
  currentStatus: TaskStatus
  currentPriority: TaskPriority
  currentContractorId: string | null
  currentTitle: string
  currentDescription: string | null
  dueDate: string | null
}

export function TaskActions({
  taskId,
  propertyId,
  currentStatus,
  currentPriority,
  currentContractorId,
  currentTitle,
  currentDescription,
  dueDate,
}: TaskActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function updateStatus(status: TaskStatus) {
    setLoading(status)
    const updates: Record<string, unknown> = { status }
    if (status === 'completed') updates.completed_at = new Date().toISOString()

    // Use API route (service client) to bypass RLS
    const res = await fetch('/api/tasks/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, updates }),
    })

    if (!res.ok) {
      const data = await res.json()
      toast.error('Failed to update', { description: data.error })
      setLoading(null)
      return
    }

    // When starting a task, always generate a magic link
    if (status === 'in_progress') {
      try {
        const linkRes = await fetch('/api/magic-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: propertyId,
            task_id: taskId,
            contractor_id: currentContractorId || undefined,
            link_type: 'contractor',
            send_email: !!currentContractorId, // only email if contractor assigned
          }),
        })
        if (linkRes.ok) {
          const { url } = await linkRes.json()
          await navigator.clipboard.writeText(url).catch(() => {})
          toast.success('Task started — magic link copied to clipboard', {
            description: currentContractorId ? 'Email sent to contractor' : 'Share the link manually',
            duration: 5000,
          })
        } else {
          toast.success('Task started')
        }
      } catch {
        toast.success('Task started')
      }
    } else {
      toast.success(`Task ${status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'updated'}`)
    }

    router.refresh()
    setLoading(null)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {/* Status transitions */}
      {currentStatus === 'pending' && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-status-info hover:bg-[hsl(var(--status-info)/0.08)]"
          disabled={loading !== null}
          onClick={() => updateStatus('in_progress')}
        >
          <Play className="h-3.5 w-3.5" />
          {loading === 'in_progress' ? 'Starting...' : 'Start'}
        </Button>
      )}

      {(currentStatus === 'pending' || currentStatus === 'in_progress') && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-status-safe hover:bg-[hsl(var(--status-safe)/0.08)]"
          disabled={loading !== null}
          onClick={() => updateStatus('completed')}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {loading === 'completed' ? 'Completing...' : 'Complete'}
        </Button>
      )}

      {currentStatus !== 'cancelled' && currentStatus !== 'completed' && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-status-danger hover:bg-[hsl(var(--status-danger)/0.08)]"
          disabled={loading !== null}
          onClick={() => updateStatus('cancelled')}
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancel
        </Button>
      )}

      {/* Delete */}
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        disabled={loading !== null}
        onClick={async () => {
          if (!confirm('Delete this task? This cannot be undone.')) return
          setLoading('delete')
          const res = await fetch('/api/tasks/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, updates: { _delete: true } }),
          })
          if (!res.ok) {
            toast.error('Failed to delete')
          } else {
            toast.success('Task deleted')
            router.push('/tasks')
            router.refresh()
          }
          setLoading(null)
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {loading === 'delete' ? 'Deleting...' : 'Delete'}
      </Button>

      {/* Edit drawer */}
      <TaskEditDrawer
        taskId={taskId}
        currentTitle={currentTitle}
        currentDescription={currentDescription}
        currentPriority={currentPriority}
        currentContractorId={currentContractorId}
        dueDate={dueDate}
      />
    </div>
  )
}

function TaskEditDrawer({
  taskId,
  currentTitle,
  currentDescription,
  currentPriority,
  currentContractorId,
  dueDate,
}: {
  taskId: string
  currentTitle: string
  currentDescription: string | null
  currentPriority: TaskPriority
  currentContractorId: string | null
  dueDate: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [priority, setPriority] = useState(currentPriority)
  const [contractorId, setContractorId] = useState(currentContractorId || '')
  const [contractors, setContractors] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!open) return
    fetch('/api/contractors/list')
      .then(r => r.json())
      .then(data => setContractors(data.contractors ?? []))
      .catch(() => {})
  }, [open])

  async function handleSave(formData: FormData) {
    setSaving(true)

    const res = await fetch('/api/tasks/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        updates: {
          title: formData.get('title') as string,
          description: formData.get('description') as string || null,
          priority,
          contractor_id: contractorId || null,
          due_date: formData.get('due_date') as string || null,
        },
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      toast.error('Failed to save', { description: data.error })
    } else {
      toast.success('Task updated')
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit Task</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          <form action={handleSave} className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</Label>
              <Input name="title" defaultValue={currentTitle} required className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
              <Input name="description" defaultValue={currentDescription || ''} className="h-11" />
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
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contractor</Label>
              <NativeSelect
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
                placeholder="Unassigned"
                options={contractors.map(c => ({ value: c.id, label: c.name }))}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Due Date</Label>
              <Input name="due_date" type="date" defaultValue={dueDate || ''} className="h-11" />
            </div>

            <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
