'use client'

import { useState, useEffect } from 'react'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { createClient } from '@/lib/supabase/client'

interface BookingRevenue {
  id: string
  guest_name: string | null
  platform: string | null
  check_in: string
  check_out: string
  gross_rental_agorot: number | null
  currency: string
  property_name: string
}

const ALL_PROPERTIES = 'all'

export function RevenueBreakdown() {
  const supabase = createClient()
  const currentYear = new Date().getFullYear()
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`)
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`)
  const [propertyId, setPropertyId] = useState<string>(ALL_PROPERTIES)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [bookings, setBookings] = useState<BookingRevenue[]>([])
  const [loading, setLoading] = useState(true)

  // Load property list once for the filter dropdown.
  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setProperties(data ?? []))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadBookings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, propertyId])

  async function loadBookings() {
    setLoading(true)
    let query = supabase
      .from('bookings')
      .select('id, guest_name, platform, check_in, check_out, gross_rental_agorot, currency, properties(name)')
      .gte('check_in', startDate)
      .lte('check_in', endDate)
      .not('gross_rental_agorot', 'is', null)
      .order('check_in', { ascending: false })

    if (propertyId !== ALL_PROPERTIES) {
      query = query.eq('property_id', propertyId)
    }

    const { data } = await query

    setBookings((data ?? []).map(b => ({
      id: b.id,
      guest_name: b.guest_name,
      platform: b.platform,
      check_in: b.check_in,
      check_out: b.check_out,
      gross_rental_agorot: b.gross_rental_agorot,
      currency: (b as Record<string, unknown>).currency as string || 'ILS',
      property_name: (b.properties as unknown as { name: string } | null)?.name || 'Unknown',
    })))
    setLoading(false)
  }

  const total = bookings.reduce((s, b) => s + (b.gross_rental_agorot || 0), 0)

  // Group by property
  const byProperty: Record<string, { total: number; count: number; currency: string }> = {}
  for (const b of bookings) {
    if (!byProperty[b.property_name]) byProperty[b.property_name] = { total: 0, count: 0, currency: b.currency }
    byProperty[b.property_name].total += b.gross_rental_agorot || 0
    byProperty[b.property_name].count++
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Revenue Breakdown
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          >
            <option value={ALL_PROPERTIES}>All properties</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          />
        </div>
      </div>

      {/* Per-property summary */}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(byProperty).map(([name, data]) => (
          <div key={name} className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-medium truncate">{name}</p>
            <CurrencyDisplay agorot={data.total} currency={data.currency} className="text-sm font-bold" />
            <p className="text-[10px] text-muted-foreground">{data.count} bookings</p>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total</p>
        <CurrencyDisplay agorot={total} className="text-lg font-bold" />
      </div>

      {/* Booking list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No bookings in selected range</p>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          {bookings.map((b, i) => (
            <div key={b.id} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{b.guest_name || 'Guest'}</p>
                <p className="text-[10px] text-muted-foreground">
                  {b.property_name} · {b.check_in} → {b.check_out}
                  {b.platform && ` · ${b.platform}`}
                </p>
              </div>
              <CurrencyDisplay agorot={b.gross_rental_agorot || 0} currency={b.currency} className="shrink-0 text-sm font-semibold" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
