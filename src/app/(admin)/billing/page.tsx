export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatILS } from '@/lib/utils'
import Link from 'next/link'
import { Receipt, AlertCircle, Clock, CheckCircle2 } from 'lucide-react'
import { GenerateStatementsButton } from '@/components/features/billing/generate-statements-button'
import { StatementActions } from '@/components/features/billing/statement-actions'
import { RecordPaymentDialog } from '@/components/features/billing/record-payment-dialog'
import { MonthSelector } from '@/components/features/billing/month-selector'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  // Auth check — defense in depth (middleware also protects this route)
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const isAdmin = user.app_metadata?.role === 'admin' || user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) redirect('/owner')

  const serviceClient = createServiceClient()
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const selectedMonth = searchParams.month || defaultMonth

  const monthLabel = new Date(selectedMonth + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  // Fetch statements for selected month
  const { data: statements } = await serviceClient
    .from('monthly_statements')
    .select('*, owners(full_name, email)')
    .eq('billing_month', selectedMonth)
    .order('created_at', { ascending: false })

  // Calculate KPIs
  const totalOwed = (statements ?? [])
    .filter(s => s.direction === 'owner_owes' && s.status !== 'paid')
    .reduce((sum, s) => sum + Math.abs(s.net_amount_agorot) - (s.amount_paid_agorot ?? 0), 0)

  const totalPaid = (statements ?? [])
    .filter(s => s.status === 'paid')
    .reduce((sum, s) => sum + Math.abs(s.net_amount_agorot), 0)

  const overdueCount = (statements ?? []).filter(s => s.status === 'overdue').length
  const pendingCount = (statements ?? []).filter(s => s.status === 'draft' || s.status === 'sent').length

  // Fetch all statements across months that are overdue/unpaid
  const { data: allOutstanding } = await serviceClient
    .from('monthly_statements')
    .select('*, owners(full_name, email)')
    .in('status', ['sent', 'overdue', 'partially_paid'])
    .order('billing_month', { ascending: true })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Billing</h1>
          <p className="text-xs text-muted-foreground">Monthly statements & payments</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSelector currentMonth={selectedMonth} />
          <GenerateStatementsButton billingMonth={selectedMonth} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-status-warning" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Outstanding</p>
          </div>
          <CurrencyDisplay agorot={totalOwed} variant="expense" className="mt-2 text-xl font-bold" />
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-safe" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Collected</p>
          </div>
          <CurrencyDisplay agorot={totalPaid} variant="income" className="mt-2 text-xl font-bold" />
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-status-info" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Pending</p>
          </div>
          <p className="mt-2 text-xl font-bold">{pendingCount}</p>
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-status-danger" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Overdue</p>
          </div>
          <p className="mt-2 text-xl font-bold text-status-danger">{overdueCount}</p>
        </div>
      </div>

      {/* Statements for Selected Month */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {monthLabel} Statements
        </p>

        {statements && statements.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {statements.map((stmt, i) => {
              const owner = stmt.owners as { full_name: string; email: string } | null
              const netAbs = Math.abs(stmt.net_amount_agorot)
              const remaining = netAbs - (stmt.amount_paid_agorot ?? 0)

              return (
                <div
                  key={stmt.id}
                  className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <Link href={`/billing/${stmt.id}`} className="min-w-0 flex-1 hover:opacity-80 transition-opacity">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{owner?.full_name}</p>
                        <StatusBadge
                          status={
                            stmt.status === 'paid' ? 'safe'
                            : stmt.status === 'overdue' ? 'danger'
                            : stmt.status === 'sent' ? 'warning'
                            : stmt.status === 'partially_paid' ? 'info'
                            : stmt.status === 'approved' ? 'safe'
                            : 'neutral'
                          }
                          label={stmt.status.replace('_', ' ')}
                          size="sm"
                        />
                        {stmt.direction === 'marcus_owes' && (
                          <StatusBadge status="info" label="Payout" size="sm" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {stmt.direction === 'owner_owes'
                          ? `Balance due: ${formatILS(remaining > 0 ? remaining : 0)}`
                          : stmt.direction === 'marcus_owes'
                            ? `Marcus owes: ${formatILS(netAbs)}`
                            : 'Zero balance'}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-3">
                      <CurrencyDisplay
                        agorot={stmt.net_amount_agorot}
                        variant={stmt.direction === 'owner_owes' ? 'expense' : 'income'}
                        className="text-sm font-semibold"
                        showSign
                      />
                      <StatementActions
                        statementId={stmt.id}
                        status={stmt.status}
                        direction={stmt.direction}
                        hasInvoice={!!stmt.gi_proforma_id}
                        paymentUrl={stmt.gi_proforma_url}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-10 text-center shadow-sm">
            <Receipt className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No statements for {monthLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click &ldquo;Generate Statements&rdquo; to calculate billing for this month
            </p>
          </div>
        )}
      </section>

      {/* All Outstanding Statements */}
      {allOutstanding && allOutstanding.length > 0 && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            All Outstanding
          </p>
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {allOutstanding.map((stmt, i) => {
              const owner = stmt.owners as { full_name: string; email: string } | null
              const remaining = Math.abs(stmt.net_amount_agorot) - (stmt.amount_paid_agorot ?? 0)
              const monthStr = new Date(stmt.billing_month + 'T00:00:00Z').toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              })

              return (
                <div
                  key={stmt.id}
                  className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{owner?.full_name}</p>
                    <p className="text-xs text-muted-foreground">{monthStr}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      status={stmt.status === 'overdue' ? 'danger' : 'warning'}
                      label={stmt.status.replace('_', ' ')}
                      size="sm"
                    />
                    <CurrencyDisplay agorot={remaining} variant="expense" className="text-sm font-semibold" />
                    <RecordPaymentDialog statementId={stmt.id} ownerName={owner?.full_name ?? ''} remainingAgorot={remaining} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
