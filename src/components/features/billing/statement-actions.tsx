'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, FileText, Send, ExternalLink, Eye, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

  const canDelete = status === 'draft' || status === 'pending_approval' || status === 'approved'
  const canInvoice = status === 'approved' && !hasInvoice && direction !== 'zero'
  const canSend = direction === 'owner_owes' && status !== 'paid' && status !== 'draft' && status !== 'pending_approval'

  async function handleAction(action: string) {
    if (action === 'delete') {
      if (!window.confirm('Delete this statement? This cannot be undone.')) return
    }
    if (action === 'create-invoice') {
      if (!window.confirm('Create the invoice? This cannot be undone.')) return
    }

    setLoading(action)
    try {
      const endpointMap: Record<string, string> = {
        'create-invoice': `/api/statements/${statementId}/create-invoice`,
        'send-reminder': `/api/statements/${statementId}/send-reminder`,
        'delete': `/api/statements/${statementId}/delete`,
      }

      const res = await fetch(endpointMap[action], {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${action}`)

      toast.success(data.message)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed: ${action}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label="Statement actions">
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.push(`/billing/${statementId}`)}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        {canInvoice && (
          <DropdownMenuItem
            onClick={() => handleAction('create-invoice')}
            disabled={loading === 'create-invoice'}
          >
            <FileText className="mr-2 h-4 w-4" />
            {loading === 'create-invoice' ? 'Creating...' : direction === 'marcus_owes' ? 'Record Payout' : 'Create Invoice'}
          </DropdownMenuItem>
        )}
        {canSend && (
          <DropdownMenuItem
            onClick={() => handleAction('send-reminder')}
            disabled={loading === 'send-reminder'}
          >
            <Send className="mr-2 h-4 w-4" />
            {loading === 'send-reminder' ? 'Sending...' : 'Send to Owner'}
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
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleAction('delete')}
              disabled={loading === 'delete'}
              className="text-status-danger"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {loading === 'delete' ? 'Deleting...' : 'Delete Statement'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
