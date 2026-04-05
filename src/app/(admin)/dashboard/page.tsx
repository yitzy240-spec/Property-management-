export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { AlertTriangle, Calendar as CalendarIcon, ArrowRight, ChevronRight, TrendingUp } from 'lucide-react'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { StatusBadge } from '@/components/ui/status-badge'
import { createServiceClient } from '@/lib/supabase/server'
import { formatILS, VAT_THRESHOLD_AGOROT, VAT_WARNING_PERCENT } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = createServiceClient()
  const currentYear = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]

  const [
    { data: properties },
    { count: openTaskCount },
    { count: pendingBillCount },
    { data: revenueData },
    { data: upcomingBookings },
  ] = await Promise.all([
    supabase.from('properties').select('*, owners(full_name)').eq('is_active', true).order('name'),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    supabase.from('bills').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('revenue_tracking').select('total_revenue_agorot').eq('year', currentYear),
    supabase.from('bookings').select('*, properties(name)').gte('check_in', today).order('check_in').limit(5),
  ])

  const ytdRevenue = revenueData?.reduce((sum, r) => sum + (r.total_revenue_agorot || 0), 0) ?? 0
  const vatPercent = Math.round((ytdRevenue / VAT_THRESHOLD_AGOROT) * 100)
  const isVatWarning = vatPercent >= VAT_WARNING_PERCENT * 100

  return (
    <div className="space-y-6">
      {/* ── Hero: Portfolio Summary ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Portfolio</h1>
          <span className="font-mono text-xs text-muted-foreground">{currentYear}</span>
        </div>

        <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                YTD Revenue
              </p>
              <CurrencyDisplay agorot={ytdRevenue} variant="income" className="mt-1 text-2xl font-bold" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(152_54%_25%/0.08)]">
              <TrendingUp className="h-4 w-4 text-financial-income" />
            </div>
          </div>

          {/* KPI row */}
          <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
            <div className="bg-card px-3 py-3 text-center">
              <p className="font-mono text-lg font-bold">{properties?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Properties</p>
            </div>
            <div className="bg-card px-3 py-3 text-center">
              <p className="font-mono text-lg font-bold text-status-warning">{openTaskCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Open Tasks</p>
            </div>
            <div className="bg-card px-3 py-3 text-center">
              <p className="font-mono text-lg font-bold text-status-danger">{pendingBillCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pending Bills</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── VAT Threshold ── */}
      <section className={`rounded-[10px] border bg-card p-4 shadow-sm ${isVatWarning ? 'border-status-danger/40' : 'border-border'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium">VAT Threshold</p>
            {isVatWarning && (
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-badge)] bg-status-danger/15 px-1.5 py-0.5 text-xs font-medium text-status-danger">
                <AlertTriangle className="h-3 w-3" />90%+
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {formatILS(ytdRevenue)} / {formatILS(VAT_THRESHOLD_AGOROT)}
          </p>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${isVatWarning ? 'bg-status-danger' : 'bg-primary'}`}
            style={{ width: `${Math.min(vatPercent, 100)}%` }}
          />
        </div>
      </section>

      {/* ── Action banner: Pending bills ── */}
      {(pendingBillCount ?? 0) > 0 && (
        <Link href="/bills" className="block">
          <div className="flex items-center justify-between rounded-[10px] border border-status-warning/25 bg-[hsl(38_92%_50%/0.04)] px-4 py-3 transition-shadow hover:shadow-sm">
            <div className="flex items-center gap-2.5">
              <StatusBadge status="pending_review" label={`${pendingBillCount} bills`} size="md" />
              <span className="text-xs text-muted-foreground">need review</span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      )}

      {/* ── Properties list ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Properties</p>
          <Link href="/properties" className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          {properties && properties.length > 0 ? properties.map((property, i) => (
            <Link key={property.id} href={`/properties/${property.id}`} className="block">
              <div className={`flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-muted/40 ${i > 0 ? 'border-t border-border' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{property.name}</h3>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {Math.round(property.commission_rate * 100)}%
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{property.num_bedrooms} bed</span>
                    <span className="text-border">·</span>
                    <span className="truncate">{(property.owners as unknown as { full_name: string } | null)?.full_name}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </div>
            </Link>
          )) : (
            <div className="py-10 text-center text-sm text-muted-foreground">No properties yet.</div>
          )}
        </div>
      </section>

      {/* ── Upcoming check-ins ── */}
      {upcomingBookings && upcomingBookings.length > 0 && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Upcoming Check-ins
          </p>
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {upcomingBookings.map((booking, i) => (
              <div
                key={booking.id}
                className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{booking.guest_name || 'Guest'}</p>
                  <p className="text-xs text-muted-foreground">
                    {(booking.properties as unknown as { name: string })?.name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <CalendarIcon className="h-3 w-3" />
                  {booking.check_in}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
