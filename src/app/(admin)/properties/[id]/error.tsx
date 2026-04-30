'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

/**
 * Verbose error boundary for the property detail page — temporary diagnostic
 * to surface what's throwing in production. Next.js hides error.message in
 * prod globally, but we can show the digest hash and the message locally.
 * Once we identify the cause, this can be reverted to a generic boundary.
 */
export default function PropertyErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[properties/[id] error.tsx]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      name: error.name,
    })
  }, [error])

  return (
    <div className="space-y-4 p-4">
      <Link href="/properties" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" />
        Back to properties
      </Link>
      <div className="rounded-[10px] border border-status-danger/30 bg-status-danger/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-status-danger" />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold text-status-danger">Failed to load property</h1>
            <p className="mt-2 break-words text-sm text-foreground">
              {error.message || '(message hidden in production build)'}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                ref: {error.digest}
              </p>
            )}
            {error.name && error.name !== 'Error' && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                type: {error.name}
              </p>
            )}
            <button
              onClick={reset}
              className="mt-4 rounded-[var(--radius-button)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
