'use client'

import { useState } from 'react'
import { Send, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface OwnerInviteButtonProps {
  ownerId: string
  ownerName: string
  hasAuth: boolean
}

export function OwnerInviteButton({ ownerId, ownerName, hasAuth }: OwnerInviteButtonProps) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleInvite() {
    setSending(true)
    try {
      const res = await fetch('/api/owners/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: ownerId }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to send invite')

      toast.success(`Invite sent to ${ownerName}`)
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-status-safe">
        <Check className="h-3 w-3" /> Sent
      </span>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 text-[10px]"
      disabled={sending}
      onClick={handleInvite}
    >
      <Send className="h-3 w-3" />
      {sending ? 'Sending...' : hasAuth ? 'Resend' : 'Invite'}
    </Button>
  )
}
