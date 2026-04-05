'use client'

import { useState } from 'react'
import { Check, Camera, Receipt, ExternalLink, CheckCircle2 } from 'lucide-react'
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
import { createClient } from '@/lib/supabase/client'

interface ContractorTaskViewProps {
  token: string
  property: {
    id: string
    name: string
    address: string
    entry_code: string | null
    youtube_tutorial_url: string | null
  }
  task: {
    id: string
    title: string
    description: string | null
    status: string
  } | null
  checklistItems: {
    id: string
    label: string
    is_completed: boolean
    sort_order: number
  }[]
  magicLinkId: string
}

export function ContractorTaskView({
  token,
  property,
  task,
  checklistItems: initialItems,
  magicLinkId,
}: ContractorTaskViewProps) {
  const [checklist, setChecklist] = useState(initialItems)
  const [completed, setCompleted] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const completedCount = checklist.filter((i) => i.is_completed).length
  const totalCount = checklist.length
  const allChecked = totalCount > 0 && completedCount === totalCount

  async function toggleItem(itemId: string) {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, is_completed: !item.is_completed }
          : item
      )
    )

    await fetch('/api/contractor/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, item_id: itemId }),
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'receipt') {
    const file = e.target.files?.[0]
    if (!file || !task) return

    const MAX_SIZE = 25 * 1024 * 1024
    if (file.size > MAX_SIZE) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return

    const supabase = createClient()
    const folder = type === 'receipt' ? 'receipts' : 'tasks'
    const filePath = `${folder}/${task.id}/${Date.now()}_${file.name}`

    const { error: uploadError } = await supabase.storage.from('task-media').upload(filePath, file)
    if (uploadError) {
      toast.error('Upload failed', { description: uploadError.message })
      return
    }

    toast.success(type === 'receipt' ? 'Receipt uploaded' : 'Photo uploaded')

    await fetch('/api/contractor/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        task_id: task.id,
        storage_path: filePath,
        media_type: file.type.startsWith('video') ? 'video' : 'image',
        caption: type === 'receipt' ? 'Expense receipt' : null,
      }),
    })
  }

  async function handleComplete() {
    setSubmitting(true)

    await fetch('/api/contractor/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        task_id: task?.id,
        expense_agorot: expenseAmount ? Math.round(parseFloat(expenseAmount) * 100) : 0,
      }),
    })

    setCompleted(true)
    setSubmitting(false)
  }

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] p-4">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-status-safe" />
          <h1 className="mt-4 text-lg font-semibold text-foreground">Task Complete</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you! Your work has been logged.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[#FAFAFA]">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-4">
        <div className="flex items-center gap-2">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" className="h-6 w-auto" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">ApartmentOS</p>
        </div>
        <h1 className="mt-1 text-lg font-semibold">Task Assignment</h1>
      </div>

      <div className="space-y-4 p-4">
        {/* Property Info + Entry Code */}
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">{property.name}</h2>
          <p className="text-xs text-muted-foreground">{property.address}</p>

          {property.entry_code && (
            <div className="mt-3 rounded-lg bg-primary/5 p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Entry Code</p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em]">
                {property.entry_code}
              </p>
            </div>
          )}

          {property.youtube_tutorial_url && (
            <a
              href={property.youtube_tutorial_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block"
            >
              <Button variant="outline" size="sm" className="w-full gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Watch Apartment Tutorial
              </Button>
            </a>
          )}
        </div>

        {/* Task Details */}
        {task && (
          <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{task.title}</h3>
            {task.description && (
              <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
            )}
          </div>
        )}

        {/* Checklist */}
        {checklist.length > 0 && (
          <div className="rounded-[10px] border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Checklist</p>
                <span className="font-mono text-xs text-muted-foreground">{completedCount}/{totalCount}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-status-safe transition-all"
                  style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="p-1">
              {checklist.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                      item.is_completed
                        ? 'border-status-safe bg-status-safe text-white'
                        : 'border-muted-foreground/30'
                    }`}
                  >
                    {item.is_completed && <Check className="h-4 w-4" />}
                  </div>
                  <span
                    className={`text-sm ${
                      item.is_completed ? 'text-muted-foreground line-through' : 'font-medium'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Photo Upload */}
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <Label className="text-xs font-semibold">Upload Photos</Label>
          <p className="mb-3 text-xs text-muted-foreground">
            Take photos of completed work for the owner record.
          </p>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <Camera className="h-5 w-5" />
            Tap to take or upload photo
            <input
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'photo')}
            />
          </label>
        </div>

        {/* Expense */}
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <Label className="text-xs font-semibold">Expense (optional)</Label>
          <p className="mb-3 text-xs text-muted-foreground">
            Log any materials purchased for this task.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                &#8362;
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="h-11 pl-7 font-mono"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-button)] border border-border px-3 text-xs text-muted-foreground hover:bg-muted">
              <Receipt className="h-3.5 w-3.5" />
              Receipt
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileUpload(e, 'receipt')}
              />
            </label>
          </div>
        </div>

        {/* Complete — Drawer confirmation */}
        <Drawer>
          <DrawerTrigger asChild>
            <Button
              disabled={totalCount > 0 && !allChecked}
              className="h-12 w-full rounded-[var(--radius-button)] bg-status-safe text-base font-semibold hover:bg-status-safe/90"
            >
              Complete Task
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Confirm Completion</DrawerTitle>
              <DrawerDescription>
                This will mark the task as done and notify the property manager.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button
                onClick={handleComplete}
                disabled={submitting}
                className="h-12 w-full rounded-[var(--radius-button)] bg-status-safe text-base font-semibold hover:bg-status-safe/90"
              >
                {submitting ? 'Submitting...' : 'Yes, Complete Task'}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline" className="w-full">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {totalCount > 0 && !allChecked && (
          <p className="text-center text-xs text-muted-foreground">
            Complete all checklist items to submit
          </p>
        )}
      </div>
    </div>
  )
}
