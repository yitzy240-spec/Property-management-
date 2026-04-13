'use client'

import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'

interface GIDocument {
  id: string
  number: number
  type: number
  status: number
  amount: number
  currency: string
  documentDate: string
  client?: { id: string; name: string }
}

const TYPE_SHORT: Record<number, string> = {
  10: 'Quote',
  300: 'Payment Request',
  305: 'Invoice',
  320: 'Invoice & Receipt',
  330: 'Credit Note',
  400: 'Receipt',
}

interface InvoiceHistoryProps {
  clientFilter?: string
  limit?: number
  showHeader?: boolean
}

export function InvoiceHistory({ clientFilter, limit, showHeader = true }: InvoiceHistoryProps) {
  const [documents, setDocuments] = useState<GIDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const url = clientFilter
          ? `/api/green-invoice/invoices?client=${encodeURIComponent(clientFilter)}`
          : '/api/green-invoice/invoices'
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          let items = data.items || []

          setTotal(items.length)
          if (limit) items = items.slice(0, limit)
          setDocuments(items)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [clientFilter, limit])

  if (loading) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-6 text-center text-sm text-muted-foreground shadow-sm">
        Loading invoices...
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-6 text-center text-sm text-muted-foreground shadow-sm">
        No invoices found
      </div>
    )
  }

  return (
    <div>
      {showHeader && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Invoice History
          </p>
          <span className="font-mono text-xs text-muted-foreground">{total} total</span>
        </div>
      )}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
        {documents.map((doc, i) => (
          <div
            key={doc.id}
            className={`flex items-center justify-between px-3 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded-[var(--radius-badge)] bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {TYPE_SHORT[doc.type] || 'Doc'}
                </span>
                <span className="font-mono text-xs text-muted-foreground">#{doc.number}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {doc.client?.name || 'No client'} · {doc.documentDate}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="font-mono text-sm font-semibold">
                {doc.currency === 'ILS' ? '₪' : '$'}{doc.amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <a
                href={`/api/green-invoice/invoices/${doc.id}/download?lang=he`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Download PDF"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
