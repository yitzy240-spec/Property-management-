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
    { data: currentBookings },
    { data: openTasks },
  ] = await Promise.all([
    supabase.from('properties').select('*, owners(full_name), lodgify_data').eq('is_active', true).order('name'),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    supabase.from('bills').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('bookings').select('gross_rental_agorot, channel_fees_agorot, currency, properties(commission_rate)').gte('check_in', `${currentYear}-01-01`).lte('check_in', `${currentYear}-12-31`).not('gross_rental_agorot', 'is', null).eq('is_cancelled', false),
    supabase.from('bookings').select('*, properties(name)').gte('check_in', today).order('check_in').eq('is_cancelled', false).limit(5),
    // Per-property: current/next booking and open tasks
    supabase.from('bookings').select('property_id, guest_name, check_in, check_out').gte('check_out', today).order('check_in').eq('is_cancelled', false),
    supabase.from('tasks').select('property_id').in('status', ['pending', 'in_progress']),
  ])

  // Build per-property status maps
  const propertyBookingMap = {} as { [key: string]: { guest: string; checkIn: string; checkOut: string } }
  for (const b of currentBookings ?? []) {
    if (!propertyBookingMap[b.property_id]) {
      propertyBookingMap[b.property_id] = { guest: b.guest_name || 'Guest', checkIn: b.check_in, checkOut: b.check_out }
    }
  }

  const propertyTaskCount = {} as { [key: string]: number }
  for (const t of openTasks ?? []) {
    propertyTaskCount[t.property_id] = (propertyTaskCount[t.property_id] || 0) + 1
  }

  // YTD revenue on the manager dashboard = Marcus Properties' OWN
  // income (commission), NOT what passes through to owners. Per
  // booking: (gross - channel_fees) × property.commission_rate.
  // Grouped by currency so a USD Airbnb stay and an ILS direct
  // booking don't get summed as if they share a unit — display
  // shows one line per currency, no conversion.
  const ytdCommissionByCurrency: Record<string, number> = {}
  for (const b of revenueData ?? []) {
    const gross = b.gross_rental_agorot ?? 0
    const fees = (b as { channel_fees_agorot?: number | null }).channel_fees_agorot ?? 0
    const net = gross - fees
    const rate = ((b as { properties?: { commission_rate?: number } | null }).properties?.commission_rate) ?? 0
    const commission = Math.round(net * rate)
    const c = (b as { currency?: string }).currency || 'ILS'
    ytdCommissionByCurrency[c] = (ytdCommissionByCurrency[c] || 0) + commission
  }
  // VAT threshold is an Israeli tax obligation on Marcus Properties'
  // ILS revenue — track only the ILS slice.
  const ytdCommissionILS = ytdCommissionByCurrency['ILS'] ?? 0
  const vatPercent = Math.round((ytdCommissionILS / VAT_THRESHOLD_AGOROT) * 100)
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
          <Link href="/financials" className="flex items-baseline justify-between group">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                YTD Revenue
              </p>
              <p className="text-[10px] text-muted-foreground">
                Your commission across properties · per currency
              </p>
              <div className="mt-1 space-y-0.5">
                {Object.keys(ytdCommissionByCurrency).length === 0 ? (
                  <CurrencyDisplay agorot={0} variant="income" className="text-2xl font-bold" />
                ) : (
                  Object.entries(ytdCommissionByCurrency)
                    .sort()
                    .map(([currency, amount]) => (
                      <CurrencyDisplay
                        key={currency}
                        agorot={amount}
                        currency={currency}
                        variant="income"
                        className="block text-2xl font-bold"
                      />
                    ))
                )}
              </div>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(152_54%_25%/0.08)] group-hover:bg-[hsl(152_54%_25%/0.15)] transition-colors">
              <TrendingUp className="h-4 w-4 text-financial-income" />
            </div>
          </Link>

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
            {formatILS(ytdCommissionILS)} / {formatILS(VAT_THRESHOLD_AGOROT)}
          </p>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">ILS commission only — USD/foreign income not converted</p>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${isVatWarning ? 'bg-status-danger' : 'bg-primary'}`}
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

      {/* ── Properties tiles ── */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Properties</p>

        {properties && properties.length > 0 ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {properties.map((property) => {
              const ld = property.lodgify_data as { image_url?: string } | null
              const heroImage = (property as Record<string, unknown>).image_url as string | null
                || (ld?.image_url ? `https:${ld.image_url}` : null)
              const booking = propertyBookingMap[property.id]
              const tasks = propertyTaskCount[property.id] || 0
              const isOccupied = !!booking && booking.checkIn <= today && booking.checkOut >= today

              return (
                <Link key={property.id} href={`/properties/${property.id}`} className="group block">
                  <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                      {heroImage ? (
                        <img src={heroImage} alt={property.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">No image</div>
                      )}
                      {/* Status overlay */}
                      <div className="absolute left-1.5 top-1.5 flex gap-1">
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm ${
                          isOccupied
                            ? 'bg-status-safe/90 text-white'
                            : 'bg-black/50 text-white'
                        }`}>
                          {isOccupied ? 'Occupied' : 'Vacant'}
                        </span>
                        {tasks > 0 && (
                          <span className="rounded-md bg-status-warning/90 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                            {tasks} task{tasks > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <h3 className="truncate text-xs font-semibold">{property.name}</h3>
                      {booking ? (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {isOccupied ? booking.guest : `Next: ${booking.guest}`} · {isOccupied ? `out ${new Date(booking.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : new Date(booking.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      ) : (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {(property.owners as unknown as { full_name: string } | null)?.full_name}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">No properties yet.</div>
        )}
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
