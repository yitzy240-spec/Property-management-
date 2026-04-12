export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatILS } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { StatementEditor } from '@/components/features/billing/statement-editor'

export default async function StatementDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const isAdmin = user.app_metadata?.role === 'admin' || user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) redirect('/owner')

  const serviceClient = createServiceClient()

  const { data: statement, error } = await serviceClient
    .from('monthly_statements')
    .select('*, owners(full_name, email)')
    .eq('id', params.id)
    .single()

  if (error || !statement) notFound()

  const owner = statement.owners as { full_name: string; email: string }
  const monthLabel = new Date(statement.billing_month + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const statusColor =
    statement.status === 'approved' ? 'safe'
    : statement.status === 'paid' ? 'safe'
    : statement.status === 'sent' ? 'info'
    : statement.status === 'overdue' ? 'danger'
    : 'warning'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href={`/billing?month=${statement.billing_month}`} className="inline-flex min-h-[44px] items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1">
          <ChevronLeft className="h-4 w-4" />
          Back to Billing
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{owner.full_name}</h1>
            <p className="text-xs text-muted-foreground">{monthLabel} Statement</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={statusColor} label={statement.status.replace('_', ' ')} />
            {statement.direction !== 'zero' && (
              <StatusBadge
                status={statement.direction === 'owner_owes' ? 'warning' : 'info'}
                label={statement.direction === 'owner_owes' ? 'Owner owes' : 'Payout'}
              />
            )}
          </div>
        </div>
      </div>

      {/* Net summary */}
      <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Rental Income</p>
            <CurrencyDisplay agorot={statement.gross_rental_agorot} variant="income" className="mt-1 text-lg font-bold" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Charges</p>
            <CurrencyDisplay
              agorot={statement.commission_agorot + statement.hourly_charges_agorot + statement.fixed_fee_agorot + statement.bills_paid_agorot}
              variant="expense"
              className="mt-1 text-lg font-bold"
            />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Net</p>
            <CurrencyDisplay
              agorot={statement.net_amount_agorot}
              variant={statement.direction === 'owner_owes' ? 'expense' : 'income'}
              className="mt-1 text-lg font-bold"
              showSign
            />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
            <p className="mt-1 text-lg font-bold capitalize">{statement.status.replace('_', ' ')}</p>
          </div>
        </div>
      </div>

      {/* Editable line items */}
      <StatementEditor
        statementId={statement.id}
        status={statement.status}
        direction={statement.direction}
        lineItems={statement.line_items as Array<{
          property_id: string
          property_name: string
          section: string
          category: string
          description: string
          amount_agorot: number
          source_id?: string
          source_type?: string
          is_manual?: boolean
        }>}
        hasInvoice={!!statement.gi_proforma_id}
        paymentUrl={statement.gi_proforma_url}
      />
    </div>
  )
}
