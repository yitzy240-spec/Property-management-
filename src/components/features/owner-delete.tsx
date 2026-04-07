'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function OwnerDeleteButton({ ownerId, ownerName, authUserId }: {
  ownerId: string
  ownerName: string
  authUserId: string | null
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/owners/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId, authUserId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`${ownerName} deleted`)
      router.push('/owners')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={handleDelete} disabled={deleting}>
          {deleting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          {deleting ? 'Deleting...' : 'Confirm Delete'}
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setConfirming(false)} disabled={deleting}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
      <Trash2 className="h-3 w-3" />
      Delete
    </Button>
  )
}
