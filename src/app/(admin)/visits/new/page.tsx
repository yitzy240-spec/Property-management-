'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { VisitChecklist } from '@/components/features/visit-checklist'
import { VisitMediaUpload, uploadVisitMedia, type MediaFile } from '@/components/features/visit-media-upload'
import type { ChecklistKey } from '@/types'

export default function LogVisitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const propertyId = searchParams.get('property') ?? ''
  const propertyName = searchParams.get('name') ?? 'Property'

  const [saving, setSaving] = useState(false)
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0])
  const [checked, setChecked] = useState<Set<ChecklistKey>>(new Set())
  const [note, setNote] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])

  function handleChecklistChange(key: ChecklistKey, value: boolean) {
    setChecked(prev => {
      const next = new Set(prev)
      if (value) next.add(key)
      else next.delete(key)
      return next
    })
  }

  async function handleSubmit() {
    if (!propertyId) { toast.error('No property selected'); return }
    setSaving(true)

    try {
      const checklist: Partial<Record<ChecklistKey, boolean>> = {}
      for (const key of checked) {
        checklist[key] = true
      }

      let media: { file_path: string; file_type: string; is_private: boolean }[] = []
      if (mediaFiles.length > 0) {
        const tempId = crypto.randomUUID()
        media = await uploadVisitMedia(propertyId, tempId, mediaFiles)
      }

      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          visited_at: visitDate,
          checklist,
          note: note || null,
          admin_note: adminNote || null,
          media,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save visit')
      }

      toast.success('Visit logged')
      router.push('/visits')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save visit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/visits" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Log Visit</h1>
          <p className="text-xs text-muted-foreground">{decodeURIComponent(propertyName)}</p>
        </div>
      </div>

      {/* Visit Date */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Visit Date</p>
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">Date</span>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="rounded-[var(--radius-button)] border border-border bg-background px-3 py-1.5 font-mono text-sm"
            />
          </div>
        </div>
      </section>

      {/* Checklist */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Checklist ({checked.size}/11)
        </p>
        <VisitChecklist checked={checked} onChange={handleChecklistChange} />
      </section>

      {/* Photos & Videos */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Photos &amp; Videos</p>
        <VisitMediaUpload files={mediaFiles} onFilesChange={setMediaFiles} />
      </section>

      {/* Note for Owner */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Note for Owner</p>
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Everything looks great. Replaced light bulb in kitchen..."
            rows={3}
            className="w-full bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Visible to the property owner</p>
      </section>

      {/* Private Note */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Private Note</p>
        <div className="overflow-hidden rounded-[10px] border border-dashed border-primary bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <span className="text-xs font-semibold">Admin Note</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">ADMIN ONLY</span>
          </div>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Next time: bring screwdriver to tighten chairs..."
            rows={2}
            className="w-full bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Only visible to you — reminders for next visit</p>
      </section>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
        size="lg"
      >
        {saving ? 'Saving...' : 'Save Visit'}
      </Button>
    </div>
  )
}
