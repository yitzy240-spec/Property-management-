export const dynamic = 'force-dynamic'

import { Building2, ClipboardList, Receipt, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { formatILS, VAT_THRESHOLD_AGOROT, VAT_WARNING_PERCENT } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient()
  const currentYear = new Date().getFullYear()

  // Parallel data fetches
  const [
    { count: propertyCount },
    { count: openTaskCount },
    { count: pendingBillCount },
    { data: revenueData },
    { data: upcomingBookings },
  ] = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    supabase.from('bills').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('revenue_tracking').select('total_revenue_agorot').eq('year', currentYear),
    supabase.from('bookings').select('*, properties(name)').gte('check_in', new Date().toISOString().split('T')[0]).order('check_in').limit(5),
  ])

  // Calculate YTD revenue
  const ytdRevenue = revenueData?.reduce((sum, r) => sum + (r.total_revenue_agorot || 0), 0) ?? 0
  const vatPercent = Math.round((ytdRevenue / VAT_THRESHOLD_AGOROT) * 100)
  const isVatWarning = vatPercent >= VAT_WARNING_PERCENT * 100

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome to ApartmentOS</p>
      </div>

      {/* VAT Threshold Tracker */}
      <Card className={isVatWarning ? 'border-destructive' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              VAT Threshold (Osek Patur)
            </CardTitle>
            {isVatWarning && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Warning
              </Badge>
            )}
          </div>
          <CardDescription>
            YTD Revenue: {formatILS(ytdRevenue)} / {formatILS(VAT_THRESHOLD_AGOROT)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                isVatWarning ? 'bg-destructive' : 'bg-primary'
              }`}
              style={{ width: `${Math.min(vatPercent, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs font-mono text-muted-foreground">
            {vatPercent}%
          </p>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{propertyCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Properties</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <ClipboardList className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{openTaskCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Open Tasks</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <Receipt className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{pendingBillCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pending Bills</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Check-ins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming Check-ins</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingBookings && upcomingBookings.length > 0 ? (
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {booking.guest_name || 'Guest'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(booking.properties as { name: string })?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {booking.check_in}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No upcoming check-ins
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
