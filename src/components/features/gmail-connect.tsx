'use client'

import { useSearchParams } from 'next/navigation'
import { Mail, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

export function GmailConnect({ isConnected }: { isConnected: boolean }) {
  const searchParams = useSearchParams()
  const gmailConnected = searchParams.get('gmail_connected') === 'true'
  const gmailError = searchParams.get('gmail_error')
  const connected = isConnected || gmailConnected

  return (
    <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Gmail Integration</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Auto-parse utility bills from email attachments.
          </p>
        </div>
        {connected ? (
          <StatusBadge status="safe" label="Connected" size="sm" />
        ) : (
          <StatusBadge status="neutral" label="Not connected" size="sm" />
        )}
      </div>

      {gmailError && (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {gmailError === 'no_code'
            ? 'Authorization was cancelled.'
            : gmailError === 'token_exchange_failed'
            ? 'Failed to connect. Contact support.'
            : `Error: ${gmailError}`}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        {connected ? (
          <>
            <p className="text-xs text-muted-foreground">
              Gmail connected. Bills with PDF attachments are auto-parsed.
            </p>
            <a href="/api/auth/gmail">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Mail className="h-3.5 w-3.5" />
                Reconnect
              </Button>
            </a>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Sign in with Google to authorize bill parsing from your inbox.
            </p>
            <a href="/api/auth/gmail">
              <Button size="sm" className="h-9 gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Connect Gmail
              </Button>
            </a>
          </>
        )}
      </div>
    </div>
  )
}
