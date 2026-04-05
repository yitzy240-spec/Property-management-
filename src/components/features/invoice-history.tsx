'use client'

import { useState, useEffect } from 'react'
import { FileText, Download } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'

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

const TYPE_LABELS: Record<number, string> = {
  10: 'Quote',
  100: 'Order',
  300: 'Proforma',
  305: 'Tax Invoice',
  320: 'Invoice/Receipt',
  330: 'Credit Note',
  400: 'Receipt',
}

const STATUS_MAP: Record<number, string> = {
  0: 'safe',    // open/active
  1: 'neutral', // closed
  2: 'neutral', // manually closed
  3: 'info',    // credit note
  4: 'danger',  // cancelled
}

interface InvoiceHistoryProps {
  /** If provided, only show documents for this client name */
  clientFilter?: string
  /** Max items to show */
  limit?: number
  /** Show title header */
  showHeader?: boolean
}

export function InvoiceHistory({ clientFilter, limit, showHeader = true }: InvoiceHistoryProps) {
  const [documents, setDocuments] = useState<GIDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/green-invoice/invoices')
        if (res.ok) {
          const data = await res.json()
          let items = data.items || []

          if (clientFilter) {
            items = items.filter((d: GIDocument) =>
              d.client?.name?.toLowerCase().includes(clientFilter.toLowerCase())
            )
          }

          setTotal(items.length)

          if (limit) {
            items = items.slice(0, limit)
          }

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
            Green Invoice History
          </p>
          <span className="font-mono text-xs text-muted-foreground">{total} total</span>
        </div>
      )}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
        {documents.map((doc, i) => (
          <div
            key={doc.id}
            className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {TYPE_LABELS[doc.type] || 'Document'} #{doc.number}
                  </p>
                  <StatusBadge
                    status={(STATUS_MAP[doc.status] || 'neutral') as 'safe' | 'danger' | 'info' | 'neutral' | 'warning'}
                    label={doc.status === 0 ? 'Active' : doc.status === 4 ? 'Cancelled' : 'Closed'}
                    size="sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {doc.client?.name || 'No client'} · {doc.documentDate}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
