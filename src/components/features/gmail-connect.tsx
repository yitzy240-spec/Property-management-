'use client'

import { useSearchParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
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
              <button className="flex h-10 items-center gap-2.5 rounded-lg border border-border bg-card px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
                <GoogleLogo />
                Reconnect
              </button>
            </a>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Sign in with Google to authorize bill parsing.
            </p>
            <a href="/api/auth/gmail">
              <button className="flex h-10 items-center gap-2.5 rounded-lg border border-border bg-card px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
                <GoogleLogo />
                Sign in with Google
              </button>
            </a>
          </>
        )}
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
