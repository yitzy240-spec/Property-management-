'use client'

import { useState, useEffect } from 'react'
import { Link2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
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

interface MagicLinkGeneratorProps {
  propertyId: string
  propertyName: string
}

interface TaskOption {
  id: string
  title: string
  status: string
  contractor_name: string | null
}

export function MagicLinkGenerator({ propertyId, propertyName }: MagicLinkGeneratorProps) {
  const [step, setStep] = useState<'type' | 'tasks' | 'done'>('type')
  const [generating, setGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())

  function reset() {
    setStep('type')
    setGeneratedUrl(null)
    setCopied(false)
    setSelectedTasks(new Set())
  }

  async function handleContractorClick() {
    // Fetch open tasks for this property
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .select('id, title, status, contractors(name)')
      .eq('property_id', propertyId)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })

    const taskList = (data ?? []).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      contractor_name: (t.contractors as unknown as { name: string } | null)?.name || null,
    }))

    if (taskList.length === 0) {
      // No tasks — generate a general contractor link
      await generate('contractor')
    } else {
      setTasks(taskList)
      // Pre-select all tasks
      setSelectedTasks(new Set(taskList.map(t => t.id)))
      setStep('tasks')
    }
  }

  function toggleTask(taskId: string) {
    setSelectedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  async function generate(linkType: 'contractor' | 'guest') {
    setGenerating(true)
    setGeneratedUrl(null)

    try {
      // For contractor links with selected tasks, use the first task
      // (magic link system is per-task, but we include task_ids in payload)
      const taskId = linkType === 'contractor' && selectedTasks.size > 0
        ? Array.from(selectedTasks)[0]
        : undefined

      const res = await fetch('/api/magic-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          link_type: linkType,
          task_id: taskId,
          task_ids: linkType === 'contractor' ? Array.from(selectedTasks) : undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to generate')
      }

      const { url } = await res.json()
      setGeneratedUrl(url)
      setStep('done')
      toast.success(`${linkType === 'guest' ? 'Guest' : 'Contractor'} link generated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setGenerating(false)
    }
  }

  async function copyToClipboard() {
    if (!generatedUrl) return
    await navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    toast.success('Link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Drawer onOpenChange={(open) => { if (!open) reset() }}>
      <DrawerTrigger asChild>
        <Button className="w-full rounded-[var(--radius-button)] sm:w-auto" size="sm">
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          Generate Magic Link
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Generate Magic Link</DrawerTitle>
          <DrawerDescription>
            Create a secure link for {propertyName}. Expires in 72 hours.
          </DrawerDescription>
        </DrawerHeader>

        <div className="p-4">
          {step === 'type' && (
            <div className="space-y-3">
              <button
                onClick={handleContractorClick}
                disabled={generating}
                className="flex w-full items-center justify-between rounded-[10px] border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-semibold">Contractor Link</p>
                  <p className="text-xs text-muted-foreground">Task checklist, photo upload, entry code, Waze</p>
                </div>
              </button>
              <button
                onClick={() => generate('guest')}
                disabled={generating}
                className="flex w-full items-center justify-between rounded-[10px] border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-semibold">Guest Check-in Link</p>
                  <p className="text-xs text-muted-foreground">Entry code (time-gated), video guide, stay info</p>
                </div>
              </button>
              {generating && (
                <p className="text-center text-xs text-muted-foreground">Generating...</p>
              )}
            </div>
          )}

          {step === 'tasks' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select tasks to include in the contractor link:</p>
              <div className="max-h-[300px] space-y-1 overflow-y-auto">
                {tasks.map(task => (
                  <label
                    key={task.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={() => toggleTask(task.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.contractor_name && (
                        <p className="text-[10px] text-muted-foreground">{task.contractor_name}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-[var(--radius-badge)] bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize">
                      {task.status}
                    </span>
                  </label>
                ))}
              </div>
              <Button
                onClick={() => generate('contractor')}
                disabled={generating || selectedTasks.size === 0}
                className="h-11 w-full"
              >
                {generating ? 'Generating...' : `Generate Link (${selectedTasks.size} task${selectedTasks.size !== 1 ? 's' : ''})`}
              </Button>
            </div>
          )}

          {step === 'done' && generatedUrl && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="break-all font-mono text-xs text-foreground">{generatedUrl}</p>
              </div>
              <Button onClick={copyToClipboard} className="w-full gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>
          )}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
