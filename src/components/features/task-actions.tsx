'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Play, CheckCircle2, XCircle, Pencil, Trash2 } from 'lucide-react'
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
import type { TaskStatus, TaskPriority } from '@/types'

interface TaskActionsProps {
  taskId: string
  currentStatus: TaskStatus
  currentPriority: TaskPriority
  currentContractorId: string | null
  currentTitle: string
  currentDescription: string | null
  dueDate: string | null
}

export function TaskActions({
  taskId,
  currentStatus,
  currentPriority,
  currentContractorId,
  currentTitle,
  currentDescription,
  dueDate,
}: TaskActionsProps) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function updateStatus(status: TaskStatus) {
    setLoading(status)
    const update: Record<string, unknown> = { status }
    if (status === 'completed') update.completed_at = new Date().toISOString()

    const { error } = await supabase
      .from('tasks')
      .update(update)
      .eq('id', taskId)

    if (error) {
      toast.error('Failed to update', { description: error.message })
    } else {
      toast.success(`Task ${status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'started'}`)
      router.refresh()
    }
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
          const { error } = await supabase.from('tasks').delete().eq('id', taskId)
          if (error) {
            toast.error('Failed to delete', { description: error.message })
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
  const supabase = createClient()
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

    const { error } = await supabase
      .from('tasks')
      .update({
        title: formData.get('title') as string,
        description: formData.get('description') as string || null,
        priority,
        contractor_id: contractorId || null,
        due_date: formData.get('due_date') as string || null,
      })
      .eq('id', taskId)

    if (error) {
      toast.error('Failed to save', { description: error.message })
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
                <SelectTrigger className="h-11"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
