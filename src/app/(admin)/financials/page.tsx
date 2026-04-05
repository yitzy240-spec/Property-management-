export const dynamic = 'force-dynamic'

import { TrendingUp } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'
import { InvoicePushButton } from '@/components/features/invoice-push-button'
import { FeeEntryAddButton } from '@/components/features/fee-entry-add'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { formatILS } from '@/lib/utils'

export default async function FinancialsPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data: feeEntries } = await serviceClient
    .from('fee_entries')
    .select('*, properties(name)')
    .eq('billing_month', currentMonth)
    .order('created_at', { ascending: false })

  const totals = (feeEntries ?? []).reduce(
    (acc, entry) => {
      acc[entry.fee_type] = (acc[entry.fee_type] || 0) + entry.amount_agorot
      acc.total += entry.amount_agorot
      return acc
    },
    { commission: 0, hourly: 0, fixed: 0, total: 0 } as Record<string, number>
  )

  const unpushedCount = (feeEntries ?? []).filter((e) => !e.pushed_to_invoice).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Financials</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FeeEntryAddButton />
          {unpushedCount > 0 && (
            <InvoicePushButton billingMonth={currentMonth} unpushedCount={unpushedCount} />
          )}
        </div>
      </div>

      {/* Fee Summary — Ledger KPI grid */}
      <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Earnings</p>
            <CurrencyDisplay agorot={totals.total} variant="income" className="mt-1 text-2xl font-bold" />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(152_54%_25%/0.08)]">
            <TrendingUp className="h-4 w-4 text-financial-income" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
          <div className="bg-card px-3 py-3 text-center">
            <CurrencyDisplay agorot={totals.commission} className="text-base font-bold" />
            <p className="text-xs text-muted-foreground">Commission</p>
          </div>
          <div className="bg-card px-3 py-3 text-center">
            <CurrencyDisplay agorot={totals.hourly} className="text-base font-bold" />
            <p className="text-xs text-muted-foreground">Hourly</p>
          </div>
          <div className="bg-card px-3 py-3 text-center">
            <CurrencyDisplay agorot={totals.fixed} className="text-base font-bold" />
            <p className="text-xs text-muted-foreground">Fixed</p>
          </div>
        </div>
      </div>

      {/* Fee Entries List */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Fee Entries
        </p>

        {feeEntries && feeEntries.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {feeEntries.map((entry, i) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {(entry.properties as { name: string } | null)?.name}
                    </p>
                    <StatusBadge status="neutral" label={entry.fee_type} size="sm" />
                  </div>
                  {entry.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {entry.pushed_to_invoice ? (
                    <StatusBadge status="safe" label="Invoiced" size="sm" />
                  ) : (
                    <StatusBadge status="warning" label="Pending" size="sm" />
                  )}
                  <CurrencyDisplay agorot={entry.amount_agorot} className="text-sm font-semibold" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-10 text-center shadow-sm">
            <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No fee entries this month</p>
            <p className="mt-1 text-xs text-muted-foreground">Fees are calculated from completed bookings and tasks</p>
          </div>
        )}
      </section>
    </div>
  )
}
