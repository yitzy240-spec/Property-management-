'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function DeleteVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/visits?id=${visitId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Visit deleted')
      router.refresh()
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed to delete')
    }
    setDeleting(false)
    setConfirming(false)
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-[11px]"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? '...' : 'Confirm'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
