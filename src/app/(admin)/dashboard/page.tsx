'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Calendar as CalendarIcon, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatILS, VAT_THRESHOLD_AGOROT, VAT_WARNING_PERCENT } from '@/lib/utils'

export default function DashboardPage() {
  const { data: properties } = useQuery<any[]>({ queryKey: ['properties'] })
  const { data: tasks } = useQuery<any[]>({ queryKey: ['tasks'] })
  const { data: bills } = useQuery<any[]>({ queryKey: ['bills'] })
  const { data: bookings } = useQuery<any[]>({ queryKey: ['bookings'] })
  const { data: revenueData } = useQuery<any[]>({ queryKey: ['revenue_tracking'] })

  const openTaskCount = tasks?.filter(t => t.status === 'pending' || t.status === 'in_progress').length ?? 0
  const pendingBillCount = bills?.filter(b => b.status === 'pending_review').length ?? 0
  const today = new Date().toISOString().split('T')[0]
  const upcomingBookings = bookings?.filter(b => b.check_in >= today).slice(0, 5) ?? []
  const ytdRevenue = revenueData?.reduce((sum, r) => sum + (r.total_revenue_agorot || 0), 0) ?? 0
  const vatPercent = Math.round((ytdRevenue / VAT_THRESHOLD_AGOROT) * 100)
  const isVatWarning = vatPercent >= VAT_WARNING_PERCENT * 100

  return (
    <div className="space-y-6">
      <Card className="border-primary/10 bg-gradient-to-br from-card to-primary/[0.03]">
        <CardContent className="p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">MTD Portfolio Summary</p>
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
              <p className="font-mono text-xl font-bold text-status-warning">{openTaskCount}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pending Bills</p>
              <p className="font-mono text-xl font-bold text-status-danger">{pendingBillCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={isVatWarning ? 'border-status-danger' : ''}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium">VAT Threshold</p>
              {isVatWarning && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />90%+
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

      {pendingBillCount > 0 && (
        <Link href="/bills">
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

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Properties</p>
          <Link href="/properties" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        <div className="space-y-2">
          {properties && properties.length > 0 ? properties.map((property: any) => (
            <Link key={property.id} href={`/properties/${property.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{property.name}</h3>
                      <p className="text-xs text-muted-foreground">{property.neighborhood || property.address}</p>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {Math.round(property.commission_rate * 100)}%
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{property.num_bedrooms} bed</span>
                    <span>·</span>
                    <span>{property.owners?.full_name}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )) : (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No properties yet.</CardContent></Card>
          )}
        </div>
      </div>

      {upcomingBookings.length > 0 && (
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Upcoming Check-ins</p>
          <div className="space-y-2">
            {upcomingBookings.map((booking: any) => (
              <Card key={booking.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{booking.guest_name || 'Guest'}</p>
                    <p className="text-xs text-muted-foreground">{booking.properties?.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <CalendarIcon className="h-3 w-3" />{booking.check_in}
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
