'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

export function CanvaStatusToast() {
  const params = useSearchParams()
  const status = params.get('canva')
  useEffect(() => {
    if (status === 'connected') toast.success('Canva connected')
    else if (status === 'state_mismatch') toast.error('Canva: state mismatch — please retry')
    else if (status === 'missing_code') toast.error('Canva: missing code in callback')
    else if (status === 'error') toast.error(`Canva: ${params.get('msg') ?? 'connection error'}`)
  }, [status, params])
  return null
}
