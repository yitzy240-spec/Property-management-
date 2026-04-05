export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { AlertTriangle, TrendingUp, TrendingDown, Calendar as CalendarIcon, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { StatusBadge } from '@/components/ui/status-badge'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { formatILS, VAT_THRESHOLD_AGOROT, VAT_WARNING_PERCENT } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()
  const currentYear = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]

  // Parallel data fetches
  const [
    { data: properties },
    { count: openTaskCount },
    { count: pendingBillCount },
    { data: revenueData },
    { data: upcomingBookings },
    { count: unreadMessages },
  ] = await Promise.all([
    serviceClient.from('properties').select('id, name, address, neighborhood, num_bedrooms, commission_rate, owners(full_name)').eq('is_active', true).order('name'),
    serviceClient.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    serviceClient.from('bills').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    serviceClient.from('revenue_tracking').select('total_revenue_agorot').eq('year', currentYear),
    serviceClient.from('bookings').select('*, properties(name)').gte('check_in', today).order('check_in').limit(5),
    serviceClient.from('messages').select('*', { count: 'exact', head: true }).eq('is_read', false).eq('sender_role', 'owner'),
  ])

  // Calculate YTD revenue
  const ytdRevenue = revenueData?.reduce((sum, r) => sum + (r.total_revenue_agorot || 0), 0) ?? 0
  const vatPercent = Math.round((ytdRevenue / VAT_THRESHOLD_AGOROT) * 100)
  const isVatWarning = vatPercent >= VAT_WARNING_PERCENT * 100

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Hero — Ledger signature element */}
      <Card className="border-primary/10 bg-gradient-to-br from-card to-primary/[0.03]">
        <CardContent className="p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            MTD Portfolio Summary
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Revenue</p>
              <CurrencyDisplay agorot={ytdRevenue} variant="income" className="text-xl font-bold" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Properties</p>
              <p className="font-mono text-xl font-bold">{properties?.length ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open Tasks</p>
              <p className="font-mono text-xl font-bold text-status-warning">{openTaskCount ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pending Bills</p>
              <p className="font-mono text-xl font-bold text-status-danger">{pendingBillCount ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VAT Threshold — compact bar */}
      <Card className={isVatWarning ? 'border-status-danger' : ''}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium">VAT Threshold</p>
              {isVatWarning && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />
                  90%+
                </Badge>
              )}
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {formatILS(ytdRevenue)} / {formatILS(VAT_THRESHOLD_AGOROT)}
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${isVatWarning ? 'bg-status-danger' : 'bg-primary'}`}
              style={{ width: `${Math.min(vatPercent, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Attention items row */}
      {((pendingBillCount ?? 0) > 0 || (unreadMessages ?? 0) > 0) && (
        <div className="flex gap-3">
          {(pendingBillCount ?? 0) > 0 && (
            <Link href="/bills" className="flex-1">
              <Card className="border-status-warning/30 transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status="pending_review" label={`${pendingBillCount} bills`} size="md" />
                    <span className="text-xs text-muted-foreground">need review</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
          {(unreadMessages ?? 0) > 0 && (
            <Link href="/messages" className="flex-1">
              <Card className="border-primary/30 transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status="info" label={`${unreadMessages} messages`} size="md" />
                    <span className="text-xs text-muted-foreground">from owners</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* Property Ledger Cards — mini income statements */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Properties
          </p>
          <Link href="/properties" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {properties && properties.length > 0 ? (
            properties.map((property) => (
              <Link key={property.id} href={`/properties/${property.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">{property.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {property.neighborhood || property.address}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {Math.round(property.commission_rate * 100)}%
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{property.num_bedrooms} bed</span>
                      <span>·</span>
                      <span>{(property.owners as unknown as { full_name: string } | null)?.full_name}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No properties yet. Add your first property to get started.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Upcoming Check-ins */}
      {upcomingBookings && upcomingBookings.length > 0 && (
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Upcoming Check-ins
          </p>
          <div className="space-y-2">
            {upcomingBookings.map((booking) => (
              <Card key={booking.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{booking.guest_name || 'Guest'}</p>
                    <p className="text-xs text-muted-foreground">
                      {(booking.properties as unknown as { name: string })?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <CalendarIcon className="h-3 w-3" />
                    {booking.check_in}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
