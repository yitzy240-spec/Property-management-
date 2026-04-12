'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, FileText, Send, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface StatementActionsProps {
  statementId: string
  status: string
  direction: string
  hasInvoice: boolean
  paymentUrl: string | null
}

export function StatementActions({
  statementId,
  status,
  direction,
  hasInvoice,
  paymentUrl,
}: StatementActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function handleAction(action: string) {
    setLoading(action)
    try {
      const endpoint = action === 'create-invoice'
        ? `/api/statements/${statementId}/create-invoice`
        : `/api/statements/${statementId}/send-reminder`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${action}`)

      toast.success(data.message)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground">
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!hasInvoice && direction !== 'zero' && status === 'approved' && (
          <DropdownMenuItem
            onClick={() => handleAction('create-invoice')}
            disabled={loading === 'create-invoice'}
          >
            <FileText className="mr-2 h-4 w-4" />
            {loading === 'create-invoice' ? 'Creating...' : 'Create Invoice'}
          </DropdownMenuItem>
        )}
        {direction === 'owner_owes' && status !== 'paid' && status !== 'draft' && status !== 'pending_approval' && (
          <DropdownMenuItem
            onClick={() => handleAction('send-reminder')}
            disabled={loading === 'send-reminder'}
          >
            <Send className="mr-2 h-4 w-4" />
            {loading === 'send-reminder' ? 'Sending...' : 'Send Reminder'}
          </DropdownMenuItem>
        )}
        {paymentUrl && (
          <DropdownMenuItem
            onClick={() => window.open(paymentUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View Payment Page
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
