'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface ReportEditorProps {
  reportId: string
  status: string
  narrativeEn: string
  narrativeHe: string
}

export function ReportEditor({ reportId, status, narrativeEn, narrativeHe }: ReportEditorProps) {
  const supabase = createClient()
  const router = useRouter()
  const [tab, setTab] = useState<'en' | 'he'>('en')
  const [en, setEn] = useState(narrativeEn)
  const [he, setHe] = useState(narrativeHe)
  const [saving, setSaving] = useState(false)

  async function handleApprove() {
    setSaving(true)
    const { error } = await supabase
      .from('owner_reports')
      .update({
        edited_narrative_en: en,
        edited_narrative_he: he,
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('id', reportId)

    if (error) {
      toast.error('Failed to approve', { description: error.message })
    } else {
      toast.success('Report approved')
      router.refresh()
    }
    setSaving(false)
  }

  async function handleSend() {
    setSaving(true)
    try {
      const res = await fetch('/api/reports/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error('Failed to send', { description: data.error })
      } else {
        toast.success('Report emailed to owner')
        router.refresh()
      }
    } catch {
      toast.error('Failed to send report')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Language tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('en')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            tab === 'en' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'
          }`}
        >
          English
        </button>
        <button
          onClick={() => setTab('he')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            tab === 'he' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'
          }`}
        >
          עברית
        </button>
      </div>

      {/* Editor */}
      <textarea
        value={tab === 'en' ? en : he}
        onChange={(e) => tab === 'en' ? setEn(e.target.value) : setHe(e.target.value)}
        dir={tab === 'he' ? 'rtl' : 'ltr'}
        className="min-h-[200px] w-full rounded-[10px] border border-border bg-card p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20 md:min-h-[400px]"
      />

      {/* Actions */}
      <div className="flex gap-2">
        {status === 'draft' && (
          <Button onClick={handleApprove} disabled={saving} className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
            <Check className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Approve'}
          </Button>
        )}
        {status === 'approved' && (
          <Button onClick={handleSend} disabled={saving} variant="outline" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Mark as Sent
          </Button>
        )}
        {status === 'sent' && (
          <p className="text-sm text-muted-foreground">This report has been sent.</p>
        )}
      </div>
    </div>
  )
}
