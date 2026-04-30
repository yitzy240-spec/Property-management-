'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export function VaultDeleteButton({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete "${title}"?\n\nThis removes the file from storage. Cannot be undone.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Delete failed')
      }
      toast.success('Document deleted')
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy || pending}
      aria-label={`Delete ${title}`}
      className="rounded-[var(--radius-badge)] p-1.5 text-muted-foreground transition-colors hover:bg-status-danger/10 hover:text-status-danger disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
