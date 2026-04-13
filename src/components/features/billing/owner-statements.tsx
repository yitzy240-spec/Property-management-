'use client'

import { useState, useEffect } from 'react'
import { Receipt, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatILS } from '@/lib/utils'
import type { MonthlyStatement } from '@/types'

interface OwnerStatementsProps {
  ownerId: string
}

interface StatementWithOwner extends MonthlyStatement {
  owners: { full_name: string; email: string }
}

export function OwnerStatements({ ownerId }: OwnerStatementsProps) {
  const [statements, setStatements] = useState<StatementWithOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/statements?owner_id=${ownerId}`)
        if (res.ok) {
          const data = await res.json()
          setStatements(data.statements ?? [])
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [ownerId])

  if (loading) {
    return (
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
        {[1, 2, 3].map(i => (
          <div key={i} className={`flex justify-between px-4 py-3.5 ${i > 1 ? 'border-t border-border' : ''}`}>
            <div className="space-y-1.5">
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              <div className="h-3 w-32 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-6 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">Unable to load statements. Please refresh the page.</p>
      </div>
    )
  }

  if (statements.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-6 text-center shadow-sm">
        <Receipt className="mx-auto h-6 w-6 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">No statements yet</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
      {statements.map((stmt, i) => {
        const monthLabel = new Date(stmt.billing_month + 'T00:00:00Z').toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
        const netAbs = Math.abs(stmt.net_amount_agorot)
        const remaining = netAbs - (stmt.amount_paid_agorot ?? 0)
        const isExpanded = expanded === stmt.id
        const lineItems = (stmt.line_items ?? []) as Array<{
          description: string
          amount_agorot: number
          category: string
          section: string
          property_name: string
        }>

        return (
          <div key={stmt.id} className={i > 0 ? 'border-t border-border' : ''}>
            <button
              onClick={() => setExpanded(isExpanded ? null : stmt.id)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-muted/50 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{monthLabel}</p>
                  <StatusBadge
                    status={
                      stmt.status === 'paid' ? 'safe'
                      : stmt.status === 'overdue' ? 'danger'
                      : stmt.status === 'partially_paid' ? 'info'
                      : 'warning'
                    }
                    label={stmt.status === 'paid' ? 'Paid' : stmt.status === 'overdue' ? 'Overdue' : stmt.status === 'partially_paid' ? 'Partial' : 'Due'}
                    size="sm"
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stmt.direction === 'owner_owes' && stmt.status !== 'paid'
                    ? `Balance due: ${formatILS(remaining > 0 ? remaining : 0)}`
                    : stmt.direction === 'marcus_owes'
                      ? `Credit: ${formatILS(netAbs)}`
                      : 'Settled'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CurrencyDisplay
                  agorot={stmt.net_amount_agorot}
                  variant={stmt.direction === 'owner_owes' ? 'expense' : 'income'}
                  className="text-sm font-bold"
                  showSign
                />
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
                {/* Line items grouped by section */}
                <div className="space-y-2">
                  {(['bookings', 'fees', 'incidentals'] as const).map(section => {
                    const sectionItems = lineItems.filter(li => li.section === section)
                    if (sectionItems.length === 0) return null
                    const sectionLabel = section === 'bookings' ? 'Bookings' : section === 'fees' ? 'Fees & Commission' : 'Expenses'
                    return (
                      <div key={section}>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{sectionLabel}</p>
                        {sectionItems.map((li, j) => (
                          <div key={j} className="flex justify-between text-xs py-0.5">
                            <span className="text-muted-foreground truncate mr-3">
                              {li.property_name}: {li.description}
                            </span>
                            {li.amount_agorot !== 0 ? (
                              <CurrencyDisplay agorot={li.amount_agorot} className="shrink-0 text-xs" showSign />
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  <div className="flex justify-between border-t border-border pt-2 mt-1">
                    <span className="text-xs font-semibold">Net</span>
                    <CurrencyDisplay agorot={stmt.net_amount_agorot} className="text-xs font-bold" showSign />
                  </div>
                </div>

                {/* Payment options */}
                {stmt.direction === 'owner_owes' && stmt.status !== 'paid' && stmt.gi_proforma_url && (
                  <div className="space-y-2">
                    <a
                      href={stmt.gi_proforma_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Pay Online
                    </a>
                    <p className="text-xs text-muted-foreground text-center">
                      Credit card, Apple Pay, Google Pay, or Bit — a 3.5% processing fee applies
                    </p>
                    <div className="rounded-md border border-border p-2.5 mt-2">
                      <p className="text-xs font-medium mb-1">Bank Transfer</p>
                      <div className="grid grid-cols-2 gap-x-2 text-xs">
                        <span className="text-muted-foreground">Beneficiary</span><span className="text-right">Sara & Ariel Marcus</span>
                        <span className="text-muted-foreground">Bank</span><span className="text-right">First International (31)</span>
                        <span className="text-muted-foreground">IBAN</span><span className="text-right font-mono text-[11px]">IL620310950000000259085</span>
                        <span className="text-muted-foreground">SWIFT</span><span className="text-right font-mono">FIABORTTXXX</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">No processing fee · Include your name in the transfer reference</p>
                    </div>
                  </div>
                )}

                {(stmt.status === 'paid' || stmt.status === 'partially_paid') && stmt.amount_paid_agorot > 0 && (
                  <div className="rounded-md bg-status-safe/10 p-2">
                    <p className="text-xs font-medium text-status-safe">
                      {stmt.status === 'paid' ? 'Paid in full' : `Partial payment received: ${formatILS(stmt.amount_paid_agorot)}`}
                    </p>
                    {stmt.paid_at && (
                      <p className="text-[11px] text-status-safe/80 mt-0.5">
                        {new Date(stmt.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' })}
                        {stmt.payment_method && ` via ${stmt.payment_method.replace('_', ' ')}`}
                      </p>
                    )}
                    {stmt.status === 'partially_paid' && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Remaining: {formatILS(remaining > 0 ? remaining : 0)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
