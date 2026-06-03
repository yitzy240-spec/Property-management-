'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

// Whitelist of accepted status codes. Anything else (including stale-link or
// crafted-URL probes) is ignored to avoid surfacing attacker-controlled text.
const STATUS_MESSAGES: Record<string, { kind: 'success' | 'error'; text: string }> = {
  connected: { kind: 'success', text: 'Canva connected' },
  state_mismatch: { kind: 'error', text: 'Canva: state mismatch — please retry' },
  missing_code: { kind: 'error', text: 'Canva: missing code in callback' },
  error: { kind: 'error', text: 'Canva: connection error' },
}

export function CanvaStatusToast() {
  const params = useSearchParams()
  const status = params.get('canva')
  useEffect(() => {
    if (!status) return
    const entry = STATUS_MESSAGES[status]
    if (!entry) return
    if (entry.kind === 'success') toast.success(entry.text)
    else toast.error(entry.text)
  }, [status])
  return null
}
