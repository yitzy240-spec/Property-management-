'use client'

import { useState, useMemo } from 'react'
import { Link2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { jerusalemDateAt } from '@/lib/jerusalem-time'
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

function fmt(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

export function MagicLinkGenerator({ propertyId, propertyName }: MagicLinkGeneratorProps) {
  const [step, setStep] = useState<'type' | 'guest-options' | 'tasks' | 'done'>('type')
  const [generating, setGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())

  // Guest form state
  const [revealImmediately, setRevealImmediately] = useState(false)
  const [revealInDays, setRevealInDays] = useState<string>('')
  const [neverExpires, setNeverExpires] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState<string>('')

  function reset() {
    setStep('type')
    setGeneratedUrl(null)
    setCopied(false)
    setSelectedTasks(new Set())
    setRevealImmediately(false)
    setRevealInDays('')
    setNeverExpires(false)
    setExpiresInDays('')
  }

  const now = useMemo(() => new Date(), [step])

  const revealAtPreview = useMemo(() => {
    if (revealImmediately) return null
    const n = Number(revealInDays)
    if (revealInDays === '' || isNaN(n) || n < 0 || n > 30) return null
    return jerusalemDateAt(n, 7, 0, now)
  }, [revealImmediately, revealInDays, now])

  const expiresAtPreview = useMemo(() => {
    if (neverExpires) return null
    const n = Number(expiresInDays)
    if (expiresInDays === '' || isNaN(n) || n < 0 || n > 30) return null
    return jerusalemDateAt(n, 23, 59, now)
  }, [neverExpires, expiresInDays, now])

  const revealChosen = revealImmediately || revealInDays !== ''
  const expiryChosen = neverExpires || expiresInDays !== ''
  const canGenerateGuest = revealChosen && expiryChosen && !generating

  async function handleContractorClick() {
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .select('id, title, status, contractors(name)')
      .eq('property_id', propertyId)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })

    const taskList = (data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      contractor_name: (t.contractors as unknown as { name: string } | null)?.name || null,
    }))

    if (taskList.length === 0) {
      await generateContractor()
    } else {
      setTasks(taskList)
      setSelectedTasks(new Set(taskList.map((t) => t.id)))
      setStep('tasks')
    }
  }

  function toggleTask(taskId: string) {
    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  async function generateContractor() {
    setGenerating(true)
    setGeneratedUrl(null)
    try {
      const taskId = selectedTasks.size > 0 ? Array.from(selectedTasks)[0] : undefined
      const res = await fetch('/api/magic-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          link_type: 'contractor',
          task_id: taskId,
          task_ids: Array.from(selectedTasks),
          // contractor links keep the existing default — 72 hours via DB-row expiry
          expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          code_reveals_at: null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to generate')
      }
      const { url } = await res.json()
      setGeneratedUrl(url)
      setStep('done')
      toast.success('Contractor link generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setGenerating(false)
    }
  }

  async function generateGuest() {
    setGenerating(true)
    setGeneratedUrl(null)
    try {
      const res = await fetch('/api/magic-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          link_type: 'guest',
          code_reveals_at: revealAtPreview ? revealAtPreview.toISOString() : null,
          expires_at: expiresAtPreview ? expiresAtPreview.toISOString() : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to generate')
      }
      const { url } = await res.json()
      setGeneratedUrl(url)
      setStep('done')
      toast.success('Guest link generated')
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
          <DrawerDescription>Create a secure link for {propertyName}.</DrawerDescription>
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
                  <p className="text-xs text-muted-foreground">Task checklist, photo upload, entry code, Waze · 72h expiry</p>
                </div>
              </button>
              <button
                onClick={() => setStep('guest-options')}
                disabled={generating}
                className="flex w-full items-center justify-between rounded-[10px] border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-semibold">Guest Check-in Link</p>
                  <p className="text-xs text-muted-foreground">Pick when the code reveals and when the link expires</p>
                </div>
              </button>
            </div>
          )}

          {step === 'guest-options' && (
            <div className="space-y-4">
              <section className="rounded-[10px] border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Code reveal</p>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={revealImmediately}
                    onChange={(e) => {
                      setRevealImmediately(e.target.checked)
                      if (e.target.checked) setRevealInDays('')
                    }}
                  />
                  Reveal immediately
                </label>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span>Reveal in</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={revealInDays}
                    onChange={(e) => {
                      setRevealInDays(e.target.value)
                      if (e.target.value !== '') setRevealImmediately(false)
                    }}
                    disabled={revealImmediately}
                    className="h-8 w-20 rounded-[6px] border border-border bg-background px-2 text-sm"
                  />
                  <span>days</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {revealImmediately
                    ? 'Code shows on first open.'
                    : revealAtPreview
                      ? `Code reveals ${fmt(revealAtPreview)} (Jerusalem)`
                      : 'Pick a number of days or check the box above.'}
                </p>
              </section>

              <section className="rounded-[10px] border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Link expiry</p>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={neverExpires}
                    onChange={(e) => {
                      setNeverExpires(e.target.checked)
                      if (e.target.checked) setExpiresInDays('')
                    }}
                  />
                  Never expires
                </label>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span>Expires in</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={expiresInDays}
                    onChange={(e) => {
                      setExpiresInDays(e.target.value)
                      if (e.target.value !== '') setNeverExpires(false)
                    }}
                    disabled={neverExpires}
                    className="h-8 w-20 rounded-[6px] border border-border bg-background px-2 text-sm"
                  />
                  <span>days</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {neverExpires
                    ? 'Link never expires.'
                    : expiresAtPreview
                      ? `Expires ${fmt(expiresAtPreview)} (Jerusalem)`
                      : 'Pick a number of days or check the box above.'}
                </p>
              </section>

              <Button
                onClick={generateGuest}
                disabled={!canGenerateGuest}
                className="h-11 w-full"
              >
                {generating ? 'Generating...' : 'Generate Guest Link'}
              </Button>
            </div>
          )}

          {step === 'tasks' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select tasks to include in the contractor link:</p>
              <div className="max-h-[300px] space-y-1 overflow-y-auto">
                {tasks.map((task) => (
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
                onClick={generateContractor}
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
