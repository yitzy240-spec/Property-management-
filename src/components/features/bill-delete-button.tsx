'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export function BillDeleteButton({
  billId,
  label,
  size = 'icon',
}: {
  billId: string
  label: string
  size?: 'icon' | 'text'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete bill "${label}" permanently?\n\nUse this for test bills, duplicates, or things that aren't real bills. For real bills you don't want owners to see, prefer "Reject" — that hides them but keeps the system from re-ingesting the same email.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/bills/${billId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Delete failed')
      }
      toast.success('Bill deleted')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  if (size === 'text') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="flex items-center gap-1 rounded-[var(--radius-badge)] px-2 py-1 text-xs font-medium text-status-danger hover:bg-status-danger/10 disabled:opacity-50"
      >
        <Trash2 className="h-3 w-3" />
        Delete bill
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      aria-label={`Delete ${label}`}
      className="rounded-[var(--radius-badge)] p-1.5 text-muted-foreground hover:bg-status-danger/10 hover:text-status-danger disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
