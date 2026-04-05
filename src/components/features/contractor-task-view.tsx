'use client'

import { useState } from 'react'
import { Check, Camera, Receipt, ExternalLink, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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

    // Persist via API
    await fetch('/api/contractor/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, item_id: itemId }),
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'receipt') {
    const file = e.target.files?.[0]
    if (!file || !task) return

    // Validate file type and size
    const MAX_SIZE = 25 * 1024 * 1024 // 25MB
    if (file.size > MAX_SIZE) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return

    const supabase = createClient()
    const folder = type === 'receipt' ? 'receipts' : 'tasks'
    const filePath = `${folder}/${task.id}/${Date.now()}_${file.name}`

    await supabase.storage.from('task-media').upload(filePath, file)

    // Create task_media record via API
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
      <div className="flex min-h-screen items-center justify-center bg-status-safe/5 p-4">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-status-safe" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Task Complete</h1>
          <p className="mt-2 text-sm text-status-safe">
            Thank you! Your work has been logged.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background">
      {/* Header */}
      <div className="border-b bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">ApartmentOS</p>
        <h1 className="text-lg font-bold">Task Assignment</h1>
      </div>

      <div className="space-y-4 p-4">
        {/* Property Info + Entry Code */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold">{property.name}</h2>
            <p className="text-sm text-muted-foreground">{property.address}</p>

            {property.entry_code && (
              <div className="mt-3 rounded-lg bg-primary/5 p-3 text-center">
                <p className="text-xs font-medium text-muted-foreground">Entry Code</p>
                <p className="text-4xl font-bold font-mono tracking-[0.2em]">
                  {property.entry_code}
                </p>
              </div>
            )}

            {property.youtube_tutorial_url && (
              <a
                href={property.youtube_tutorial_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2"
              >
                <Button variant="outline" size="sm" className="w-full">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Watch Apartment Tutorial
                </Button>
              </a>
            )}
          </CardContent>
        </Card>

        {/* Task Details */}
        {task && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{task.title}</CardTitle>
              {task.description && (
                <p className="text-sm text-muted-foreground">{task.description}</p>
              )}
            </CardHeader>
          </Card>
        )}

        {/* Checklist */}
        {checklist.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Checklist</CardTitle>
                <Badge variant={allChecked ? 'default' : 'secondary'}>
                  {completedCount}/{totalCount}
                </Badge>
              </div>
              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-status-safe transition-all"
                  style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
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
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Photo Upload */}
        <Card>
          <CardContent className="p-4">
            <Label className="text-sm font-medium">Upload Photos</Label>
            <p className="mb-3 text-xs text-muted-foreground">
              Take photos of completed work for the owner record.
            </p>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
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
          </CardContent>
        </Card>

        {/* Expense */}
        <Card>
          <CardContent className="p-4">
            <Label className="text-sm font-medium">Expense (optional)</Label>
            <p className="mb-3 text-xs text-muted-foreground">
              Log any materials purchased for this task.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ₪
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pl-7 font-mono"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-1 rounded-md border px-3 text-xs text-muted-foreground hover:bg-muted">
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
          </CardContent>
        </Card>

        {/* Complete Button */}
        <Button
          onClick={handleComplete}
          disabled={submitting || (totalCount > 0 && !allChecked)}
          className="w-full bg-status-safe py-6 text-lg hover:bg-status-safe/90"
        >
          {submitting ? 'Submitting...' : 'Complete Task'}
        </Button>

        {totalCount > 0 && !allChecked && (
          <p className="text-center text-xs text-muted-foreground">
            Complete all checklist items to submit
          </p>
        )}
      </div>
    </div>
  )
}
