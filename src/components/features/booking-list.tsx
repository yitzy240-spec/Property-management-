'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, MessageSquare, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface BookingRow {
  id: string
  guest_name: string | null
  check_in: string
  check_out: string
  platform: string | null
  gross_rental_agorot: number | null
  currency: string
  original_amount_cents: number | null
  commission_amount_agorot: number | null
  commission_collected: boolean
  deposit_amount_agorot: number | null
  payment_status: string
  notes: string | null
}

interface BookingListProps {
  bookings: BookingRow[]
  commissionRate: number
}

export function BookingList({ bookings, commissionRate }: BookingListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
      {bookings.map((booking, i) => (
        <BookingAccordionRow
          key={booking.id}
          booking={booking}
          commissionRate={commissionRate}
          isExpanded={expandedId === booking.id}
          onToggle={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
          hasBorder={i > 0}
        />
      ))}
    </div>
  )
}

function BookingAccordionRow({
  booking,
  commissionRate,
  isExpanded,
  onToggle,
  hasBorder,
}: {
  booking: BookingRow
  commissionRate: number
  isExpanded: boolean
  onToggle: () => void
  hasBorder: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const calculatedCommission = booking.gross_rental_agorot
    ? Math.round(booking.gross_rental_agorot * commissionRate)
    : 0

  const paymentDot = booking.commission_collected
    ? 'bg-status-safe'
    : booking.payment_status === 'partial'
    ? 'bg-status-warning'
    : 'bg-muted-foreground/30'

  async function toggleCommissionCollected() {
    setSaving(true)
    const { error } = await supabase
      .from('bookings')
      .update({ commission_collected: !booking.commission_collected })
      .eq('id', booking.id)

    if (error) {
      toast.error('Update failed')
    } else {
      toast.success(booking.commission_collected ? 'Marked as uncollected' : 'Commission collected')
      router.refresh()
    }
    setSaving(false)
  }

  async function updatePaymentStatus(status: string) {
    const { error } = await supabase
      .from('bookings')
      .update({ payment_status: status })
      .eq('id', booking.id)

    if (!error) router.refresh()
  }

  return (
    <div className={hasBorder ? 'border-t border-border' : ''}>
      {/* Collapsed row */}
      <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/40">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{booking.guest_name || 'Guest'}</p>
            {booking.notes && <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {booking.check_in} → {booking.check_out}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {booking.platform && <StatusBadge status="neutral" label={booking.platform} size="sm" />}
          {booking.currency !== 'ILS' && (
            <span className="text-xs text-muted-foreground">$</span>
          )}
          {booking.gross_rental_agorot ? (
            <CurrencyDisplay agorot={booking.gross_rental_agorot} className="text-sm font-semibold" />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <span className={cn('h-2 w-2 shrink-0 rounded-full', paymentDot)} />
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground/50 transition-transform', isExpanded && 'rotate-180')} />
        </div>
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          {/* Commission */}
          <div>
            <p className="text-xs font-medium text-muted-foreground">Commission</p>
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">{Math.round(commissionRate * 100)}%</span>
                <CurrencyDisplay agorot={booking.commission_amount_agorot || calculatedCommission} className="text-sm font-semibold" />
              </div>
              <Button
                size="sm"
                variant={booking.commission_collected ? 'default' : 'outline'}
                className={cn('h-7 gap-1 text-xs', booking.commission_collected && 'bg-status-safe hover:bg-status-safe/90 text-white')}
                onClick={toggleCommissionCollected}
                disabled={saving}
              >
                {booking.commission_collected ? '✓ Collected' : 'Mark Collected'}
              </Button>
            </div>
          </div>

          {/* Payment status */}
          <div>
            <p className="text-xs font-medium text-muted-foreground">Payment Status</p>
            <div className="mt-1 flex gap-1.5">
              {['pending', 'partial', 'complete'].map(status => (
                <button
                  key={status}
                  onClick={() => updatePaymentStatus(status)}
                  className={cn(
                    'rounded-[var(--radius-badge)] px-2 py-0.5 text-xs font-medium capitalize transition-colors',
                    booking.payment_status === status
                      ? status === 'complete' ? 'bg-status-safe text-white'
                        : status === 'partial' ? 'bg-status-warning text-white'
                        : 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Deposit */}
          {booking.deposit_amount_agorot && booking.deposit_amount_agorot > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Deposit</p>
              <CurrencyDisplay agorot={booking.deposit_amount_agorot} className="mt-0.5 text-sm" />
            </div>
          )}

          {/* Notes */}
          {booking.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="mt-0.5 text-sm text-foreground">{booking.notes}</p>
            </div>
          )}

          {/* Original currency */}
          {booking.currency !== 'ILS' && booking.original_amount_cents && (
            <p className="text-xs text-muted-foreground">
              Original: ${(booking.original_amount_cents / 100).toLocaleString()} {booking.currency}
              {booking.gross_rental_agorot && ` (rate used for ILS conversion)`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
