'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, MessageSquare, DollarSign, Trash2, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { StatusBadge } from '@/components/ui/status-badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export interface BookingPaymentRow {
  id: string
  booking_id: string
  amount_agorot: number
  currency: string
  method: string
  payment_date: string | null
  is_deposit: boolean
  received_by: string | null
  notes: string | null
}

interface BookingRow {
  id: string
  guest_name: string | null
  check_in: string
  check_out: string
  platform: string | null
  gross_rental_agorot: number | null
  currency: string
  original_amount_cents: number | null
  exchange_rate?: number | null
  commission_amount_agorot: number | null
  commission_collected: boolean
  deposit_amount_agorot: number | null
  payment_status: string
  notes: string | null
  /** Guest payments recorded on the booking (commission payments excluded). */
  payments?: BookingPaymentRow[]
  /** Where the booking came from — synced bookings reappear if deleted only here. */
  source?: 'lodgify' | 'ical' | 'manual'
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

  async function handleDelete() {
    const label = booking.guest_name || `${booking.check_in} → ${booking.check_out}`
    const warning =
      booking.source === 'lodgify'
        ? 'This booking is linked to Lodgify. Cancel or delete it in Lodgify too, otherwise it will reappear on the next Lodgify sync.'
        : booking.source === 'ical'
        ? 'This booking comes from a calendar feed (Airbnb / Booking.com). It will reappear on the next sync unless it is removed there.'
        : 'This booking was entered manually and will be removed permanently.'
    if (!confirm(`Delete booking "${label}"?\n\n${warning}`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Delete failed')
      }
      toast.success('Booking deleted')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
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
          {booking.gross_rental_agorot ? (
            <CurrencyDisplay agorot={booking.gross_rental_agorot} currency={booking.currency || 'ILS'} className="text-sm font-semibold" />
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
                <CurrencyDisplay agorot={booking.commission_amount_agorot || calculatedCommission} currency={booking.currency || 'ILS'} className="text-sm font-semibold" />
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

          <DepositField bookingId={booking.id} depositAgorot={booking.deposit_amount_agorot} currency={booking.currency || 'ILS'} />

          <PaymentsSection
            bookingId={booking.id}
            payments={booking.payments ?? []}
            grossAgorot={booking.gross_rental_agorot}
            currency={booking.currency || 'ILS'}
          />

          {/* Notes */}
          {booking.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="mt-0.5 text-sm text-foreground">{booking.notes}</p>
            </div>
          )}

          {/* Foreign-currency bookings are stored as entered; the rate only
              applies when the monthly statement converts them to ₪. */}
          {booking.currency !== 'ILS' && booking.gross_rental_agorot ? (
            <p className="text-xs text-muted-foreground">
              {booking.exchange_rate
                ? `Statement rate: $1 = ₪${Number(booking.exchange_rate).toFixed(2)}`
                : 'No rate saved — the statement uses the default rate'}
            </p>
          ) : null}

          {/* Delete (admin) — useful for cleaning up test stays / wrong owner_stay entries */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1 rounded-[var(--radius-badge)] px-2 py-1 text-xs font-medium text-status-danger hover:bg-status-danger/10 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Delete booking
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'bit', label: 'Bit' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
]

const currencySymbol = (currency: string) => (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₪')

/** Deposit held for the stay — always shown so it can be set or corrected. */
function DepositField({ bookingId, depositAgorot, currency }: { bookingId: string; depositAgorot: number | null; currency: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setValue(depositAgorot ? (depositAgorot / 100).toFixed(2) : '')
    setEditing(true)
  }

  async function save() {
    const amount = value.trim() === '' ? null : parseFloat(value)
    if (amount !== null && (isNaN(amount) || amount < 0)) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deposit_amount_agorot: amount === null || amount === 0 ? null : Math.round(amount * 100) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Update failed')
      }
      toast.success('Deposit saved')
      setEditing(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">Deposit</p>
      {editing ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{currencySymbol(currency)}</span>
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            placeholder="None"
            aria-label="Deposit amount"
            className="h-8 w-28 font-mono text-sm"
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
        </div>
      ) : (
        <div className="mt-0.5 flex items-center gap-2">
          {depositAgorot && depositAgorot > 0 ? (
            <CurrencyDisplay agorot={depositAgorot} currency={currency} className="text-sm" />
          ) : (
            <span className="text-sm text-muted-foreground">None</span>
          )}
          <button type="button" onClick={startEdit} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit deposit">
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

/** Guest payments with add / edit / delete. Payment status re-derives server-side. */
function PaymentsSection({
  bookingId,
  payments,
  grossAgorot,
  currency,
}: {
  bookingId: string
  payments: BookingPaymentRow[]
  grossAgorot: number | null
  currency: string
}) {
  const router = useRouter()
  /** 'new' for the add form, a payment id for its edit form, null when closed. */
  const [formFor, setFormFor] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const paid = payments.reduce((sum, p) => sum + p.amount_agorot, 0)

  async function handleDelete(p: BookingPaymentRow) {
    if (!confirm(`Delete this ${(p.amount_agorot / 100).toFixed(2)} ${currency} payment${p.payment_date ? ` from ${p.payment_date}` : ''}?`)) return
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/payments/${p.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Delete failed')
      }
      toast.success('Payment deleted')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Payments
          {payments.length > 0 && (
            <span className="ml-1.5 font-mono">
              {(paid / 100).toFixed(2)}
              {grossAgorot ? ` / ${(grossAgorot / 100).toFixed(2)}` : ''} {currencySymbol(currency)}
            </span>
          )}
        </p>
        {formFor !== 'new' && (
          <button
            type="button"
            onClick={() => setFormFor('new')}
            className="flex items-center gap-1 rounded-[var(--radius-badge)] px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
          >
            <Plus className="h-3 w-3" />
            Add payment
          </button>
        )}
      </div>

      {payments.length === 0 && formFor !== 'new' && (
        <p className="mt-0.5 text-sm text-muted-foreground">None recorded</p>
      )}

      <div className="mt-1 space-y-1">
        {payments.map(p =>
          formFor === p.id ? (
            <PaymentForm key={p.id} bookingId={bookingId} currency={currency} payment={p} onDone={() => setFormFor(null)} />
          ) : (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <CurrencyDisplay agorot={p.amount_agorot} currency={p.currency || currency} className="text-sm font-medium" />
                  {p.is_deposit && <StatusBadge status="neutral" label="Deposit" size="sm" />}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[p.payment_date, PAYMENT_METHODS.find(m => m.value === p.method)?.label ?? p.method, p.received_by, p.notes].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <button type="button" onClick={() => setFormFor(p.id)} disabled={busyId === p.id} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit payment">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => handleDelete(p)} disabled={busyId === p.id} className="rounded p-1.5 text-status-danger hover:bg-status-danger/10 disabled:opacity-50" aria-label="Delete payment">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ),
        )}
        {formFor === 'new' && <PaymentForm bookingId={bookingId} currency={currency} onDone={() => setFormFor(null)} />}
      </div>
    </div>
  )
}

function PaymentForm({
  bookingId,
  currency,
  payment,
  onDone,
}: {
  bookingId: string
  currency: string
  /** Omit to add a new payment. */
  payment?: BookingPaymentRow
  onDone: () => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [amount, setAmount] = useState(payment ? (payment.amount_agorot / 100).toFixed(2) : '')
  const [method, setMethod] = useState(payment?.method ?? 'bank_transfer')
  const [date, setDate] = useState(payment?.payment_date ?? '')
  const [isDeposit, setIsDeposit] = useState(payment?.is_deposit ?? false)
  const [notes, setNotes] = useState(payment?.notes ?? '')

  async function save() {
    const value = parseFloat(amount)
    if (isNaN(value) || value <= 0) { toast.error('Enter an amount above 0'); return }
    setSaving(true)
    try {
      const res = await fetch(
        payment ? `/api/bookings/${bookingId}/payments/${payment.id}` : `/api/bookings/${bookingId}/payments`,
        {
          method: payment ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: value,
            method,
            // New payments default to today (Jerusalem) server-side.
            payment_date: date || null,
            is_deposit: isDeposit,
            notes: notes.trim() || null,
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Save failed')
      }
      toast.success(payment ? 'Payment updated' : 'Payment added')
      onDone()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currencySymbol(currency)}</span>
          <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="0" placeholder="Amount" aria-label="Payment amount" className="h-9 pl-6 font-mono text-sm" autoFocus />
        </div>
        <Input value={date} onChange={e => setDate(e.target.value)} type="date" aria-label="Payment date" className="h-9 flex-1 text-sm" />
      </div>
      <NativeSelect value={method} onChange={e => setMethod(e.target.value)} options={PAYMENT_METHODS} aria-label="Payment method" className="h-9" />
      <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" maxLength={1000} aria-label="Payment notes" className="h-9 text-sm" />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={isDeposit} onChange={e => setIsDeposit(e.target.checked)} className="h-3.5 w-3.5" />
          This is the deposit
        </label>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? 'Saving...' : payment ? 'Save' : 'Add'}</Button>
        </div>
      </div>
    </div>
  )
}
