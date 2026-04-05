'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateBillStatus } from '@/app/(admin)/properties/actions'

export function BillActions({ billId }: { billId: string }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(action: 'approved' | 'rejected') {
    setLoading(action)
    setError(null)

    const result = await updateBillStatus(billId, action)

    if (result.error) {
      setError(result.error)
      setLoading(null)
      return
    }

    setDone(true)
    setLoading(null)
  }

  if (done) {
    return (
      <p className="text-xs text-muted-foreground">
        Updated. Refresh to see changes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        className="text-green-700 hover:bg-green-50 hover:text-green-800"
        disabled={loading !== null}
        onClick={() => handleAction('approved')}
      >
        <Check className="mr-1 h-3.5 w-3.5" />
        {loading === 'approved' ? 'Approving...' : 'Approve'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-red-700 hover:bg-red-50 hover:text-red-800"
        disabled={loading !== null}
        onClick={() => handleAction('rejected')}
      >
        <X className="mr-1 h-3.5 w-3.5" />
        {loading === 'rejected' ? 'Rejecting...' : 'Reject'}
      </Button>
      </div>
    </div>
  )
}
