export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { AlertTriangle, FileText, Image as ImageIcon } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { BillAddButton } from '@/components/features/bill-add'
import { BillEditDrawer } from '@/components/features/bill-edit'
import { cn } from '@/lib/utils'
import type { Bill } from '@/types'

const billTypeLabels: Record<string, string> = {
  arnona: 'Arnona',
  iec: 'Electricity (IEC)',
  water: 'Water',
  vaad_bayit: "Va'ad Bayit",
  internet: 'Internet',
  gas: 'Gas',
  other: 'Other',
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: bills } = await serviceClient
    .from('bills')
    .select('*, properties(name)')
    .order('created_at', { ascending: false })

  const pending = bills?.filter((b) => b.status === 'pending_review') ?? []
  const flagged = bills?.filter((b) => b.status === 'flagged') ?? []
  const approved = bills?.filter((b) => b.status === 'approved') ?? []

  const tabs = [
    { key: 'pending', label: 'Pending', count: pending.length, items: pending },
    { key: 'flagged', label: 'Flagged', count: flagged.length, items: flagged },
    { key: 'approved', label: 'Approved', count: approved.length, items: approved },
  ]

  const activeTab = searchParams.tab || 'pending'
  const activeItems = tabs.find(t => t.key === activeTab)?.items ?? pending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Bill Verification</h1>
          <p className="text-xs text-muted-foreground">
            AI-parsed bills awaiting review. Approve to make visible to owners.
          </p>
        </div>
        <BillAddButton />
      </div>

      {/* Tab bar — clickable KPI counts */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/bills?tab=${tab.key}`}
            className={cn(
              'bg-card px-3 py-3 text-center transition-colors',
              activeTab === tab.key && 'bg-primary/5'
            )}
          >
            <p className={cn(
              'font-mono text-lg font-bold',
              tab.key === 'pending' && 'text-status-warning',
              tab.key === 'flagged' && 'text-status-danger',
              tab.key === 'approved' && 'text-status-safe',
            )}>{tab.count}</p>
            <p className={cn(
              'text-xs',
              activeTab === tab.key ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}>{tab.label}</p>
          </Link>
        ))}
      </div>

      {/* Active tab content */}
      {activeItems.length > 0 ? (
        <div className="space-y-2">
          {activeItems.map((bill) => (
            <div key={bill.id} className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      {billTypeLabels[bill.bill_type] || bill.bill_type}
                    </h3>
                    {bill.is_anomaly && (
                      <span className="inline-flex items-center gap-0.5 rounded-[var(--radius-badge)] bg-status-danger/15 px-1.5 py-0.5 text-xs font-medium text-status-danger">
                        <AlertTriangle className="h-3 w-3" />
                        High
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {(bill.properties as { name: string } | null)?.name}
                    {bill.due_date && ` · Due ${bill.due_date}`}
                  </p>
                  {bill.anomaly_note && (
                    <p className="mt-1 text-xs text-status-danger">{bill.anomaly_note}</p>
                  )}
                  {bill.billing_period_start && bill.billing_period_end && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {bill.billing_period_start} → {bill.billing_period_end}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <CurrencyDisplay agorot={bill.amount_agorot} className="text-lg font-bold" />
                  <div className="mt-1">
                    <StatusBadge status={bill.status} size="sm" />
                  </div>
                </div>
              </div>

              {/* Attachments — PDF or contractor photos */}
              {(bill.pdf_storage_path || (bill.ai_parsed_data as Record<string, unknown> | null)?.task_id) && (
                <div className="mt-2 flex gap-2">
                  {bill.pdf_storage_path && (
                    <a
                      href={`/api/download?path=${encodeURIComponent(bill.pdf_storage_path)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      <FileText className="h-3 w-3" />
                      View PDF
                    </a>
                  )}
                  {(bill.ai_parsed_data as Record<string, unknown> | null)?.task_id && (
                    <Link
                      href={`/tasks/${(bill.ai_parsed_data as Record<string, unknown>).task_id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      <ImageIcon className="h-3 w-3" />
                      View Task & Photos
                    </Link>
                  )}
                </div>
              )}

              {(bill.status === 'pending_review' || bill.status === 'flagged') && (
                <div className="mt-3 border-t border-border pt-3">
                  <BillEditDrawer
                    bill={bill as Bill}
                    propertyName={(bill.properties as { name: string } | null)?.name || null}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-card py-6 text-center text-sm text-muted-foreground shadow-sm">
          {activeTab === 'pending' ? 'No bills awaiting review. Bills are parsed from Gmail every 15 minutes.' :
           activeTab === 'flagged' ? 'No flagged bills. Bills with unusual amounts appear here.' :
           'No approved bills yet.'}
        </div>
      )}
    </div>
  )
}
