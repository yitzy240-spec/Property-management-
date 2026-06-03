'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface CanvaConnectProps {
  connected: boolean
}

export function CanvaConnect({ connected }: CanvaConnectProps) {
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleDisconnect() {
    if (!confirm('Disconnect Canva? You will need to reconnect to update designs.')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/auth/canva', { method: 'DELETE' })
      if (!res.ok) throw new Error('Disconnect failed')
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="flex items-center justify-between rounded-[10px] border border-border p-4">
      <div>
        <p className="text-sm font-semibold">Canva</p>
        <p className="text-xs text-muted-foreground">
          {connected
            ? 'Connected. Code updates will sync to apartment guides.'
            : 'Connect your Canva account so apartment code changes update the guides automatically.'}
        </p>
      </div>
      {connected ? (
        <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </Button>
      ) : (
        <a href="/api/auth/canva">
          <Button>Connect Canva</Button>
        </a>
      )}
    </div>
  )
}
