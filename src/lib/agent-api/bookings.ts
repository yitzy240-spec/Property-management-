import { z } from 'zod'
import { bookingSource } from '@/lib/bookings'
import { AgentError, toMajor, toMinor, type ServiceClient } from './core'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const platform = z.enum(['direct', 'owner_stay', 'airbnb', 'booking_com', 'other'])
const currency = z.enum(['ILS', 'USD', 'EUR'])
const paymentStatus = z.enum(['pending', 'partial', 'complete'])
const money = z.number().nonnegative()

export const BookingCreate = z
  .object({
    property_id: z.string().uuid(),
    check_in: date,
    check_out: date,
    guest_name: z.string().max(200).nullish(),
    guest_email: z.string().max(200).nullish(),
    guest_phone: z.string().max(50).nullish(),
    platform: platform.default('direct'),
    amount: money.nullish(),
    currency: currency.default('ILS'),
    exchange_rate: z.number().positive().nullish(),
    channel_fees: money.nullish(),
    deposit: money.nullish(),
    payment_status: paymentStatus.default('pending'),
    notes: z.string().max(2000).nullish(),
  })
  .strict()
  .refine(b => b.check_out > b.check_in, { message: 'check_out must be after check_in', path: ['check_out'] })

export const BookingPatch = z
  .object({
    check_in: date,
    check_out: date,
    guest_name: z.string().max(200).nullable(),
    guest_email: z.string().max(200).nullable(),
    guest_phone: z.string().max(50).nullable(),
    platform,
    amount: money.nullable(),
    currency,
    exchange_rate: z.number().positive().nullable(),
    channel_fees: money.nullable(),
    deposit: money.nullable(),
    payment_status: paymentStatus,
    notes: z.string().max(2000).nullable(),
    is_cancelled: z.boolean(),
    /** Change sync-managed fields of a Lodgify/iCal booking anyway (next sync may revert). */
    force: z.boolean(),
  })
  .partial()
  .strict()

/** API field → DB column, with unit conversion for money. */
export function bookingPatchToRow(patch: z.infer<typeof BookingPatch>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  const copy = ['check_in', 'check_out', 'guest_name', 'guest_email', 'guest_phone', 'platform', 'currency', 'exchange_rate', 'payment_status', 'notes'] as const
  for (const k of copy) if (patch[k] !== undefined) row[k] = patch[k]
  if (patch.amount !== undefined) row.gross_rental_agorot = toMinor(patch.amount)
  if (patch.channel_fees !== undefined) row.channel_fees_agorot = toMinor(patch.channel_fees)
  if (patch.deposit !== undefined) row.deposit_amount_agorot = toMinor(patch.deposit)
  if (patch.is_cancelled !== undefined) {
    row.is_cancelled = patch.is_cancelled
    row.cancelled_at = patch.is_cancelled ? new Date().toISOString() : null
  }
  return row
}

/** Fields the Lodgify / iCal sync rewrites — changing them here gets reverted. */
const SYNC_MANAGED = ['check_in', 'check_out', 'guest_name', 'platform', 'amount', 'currency', 'channel_fees', 'is_cancelled'] as const

export function assertSyncSafe(
  booking: { external_id?: string | null; ical_uid?: string | null },
  patch: z.infer<typeof BookingPatch> | 'delete',
  force: boolean,
) {
  const source = bookingSource(booking)
  if (source === 'manual' || force) return
  const touched = patch === 'delete' ? ['(delete)'] : SYNC_MANAGED.filter(k => patch[k] !== undefined)
  if (touched.length === 0) return
  const where = source === 'lodgify' ? 'Lodgify' : 'the Airbnb/Booking.com calendar feed'
  throw new AgentError(
    409,
    `This booking is synced from ${where}; the next sync will overwrite ${touched.join(', ')}. ` +
      `Make the change in ${source === 'lodgify' ? 'Lodgify' : 'the channel'} instead, or resend with force=true to change it here anyway.`,
    { source, sync_managed_fields: touched },
  )
}

export const BOOKING_COLUMNS =
  'id, property_id, guest_name, guest_email, guest_phone, check_in, check_out, platform, external_id, ical_uid, ' +
  'gross_rental_agorot, channel_fees_agorot, deposit_amount_agorot, currency, exchange_rate, payment_status, notes, ' +
  'is_cancelled, created_at, updated_at, properties(name)'

type BookingRow = Record<string, unknown> & { id: string; external_id?: string | null; ical_uid?: string | null }

/** Sum of recorded guest payments per booking (commission payments excluded). */
export async function amountsPaid(db: ServiceClient, ids: string[]): Promise<Map<string, number>> {
  const paid = new Map<string, number>()
  if (ids.length === 0) return paid
  const { data } = await db
    .from('booking_payments')
    .select('booking_id, amount_agorot, is_commission')
    .in('booking_id', ids)
  for (const p of data ?? []) {
    if (p.is_commission) continue
    paid.set(p.booking_id, (paid.get(p.booking_id) ?? 0) + (p.amount_agorot ?? 0))
  }
  return paid
}

export function serializeBooking(b: BookingRow, paidMinor = 0) {
  return {
    id: b.id,
    property_id: b.property_id,
    property_name: (b.properties as { name?: string } | null)?.name ?? null,
    guest_name: b.guest_name ?? null,
    guest_email: b.guest_email ?? null,
    guest_phone: b.guest_phone ?? null,
    check_in: b.check_in,
    check_out: b.check_out,
    platform: b.platform ?? null,
    source: bookingSource(b as { external_id?: string | null; ical_uid?: string | null }),
    currency: b.currency ?? 'ILS',
    amount: toMajor(b.gross_rental_agorot as number | null),
    channel_fees: toMajor(b.channel_fees_agorot as number | null),
    deposit: toMajor(b.deposit_amount_agorot as number | null),
    exchange_rate: b.exchange_rate === null || b.exchange_rate === undefined ? null : Number(b.exchange_rate),
    amount_paid: toMajor(paidMinor),
    payment_status: b.payment_status,
    notes: b.notes ?? null,
    is_cancelled: b.is_cancelled,
    created_at: b.created_at,
    updated_at: b.updated_at,
  }
}

export async function loadBooking(db: ServiceClient, id: string): Promise<BookingRow> {
  const { data, error } = await db.from('bookings').select(BOOKING_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Booking not found.')
  return data as unknown as BookingRow
}

/** Keep payment_status in step with recorded payments when the amount is known. */
export function derivedPaymentStatus(grossMinor: number | null, paidMinor: number): 'pending' | 'partial' | 'complete' | null {
  if (!grossMinor || grossMinor <= 0) return null
  if (paidMinor <= 0) return 'pending'
  return paidMinor >= grossMinor ? 'complete' : 'partial'
}

const PAYMENT_METHODS = ['bank_transfer', 'cash', 'bit', 'credit_card', 'paypal', 'check', 'other'] as const

/** A guest payment, in major units of the booking currency (shared by the agent API and admin UI). */
export const PaymentCreate = z
  .object({
    amount: z.number().positive(),
    method: z.enum(PAYMENT_METHODS).default('bank_transfer'),
    payment_date: date.nullish(),
    is_deposit: z.boolean().default(false),
    received_by: z.string().max(200).nullish(),
    notes: z.string().max(1000).nullish(),
  })
  .strict()

export const PaymentPatch = z
  .object({
    amount: z.number().positive(),
    method: z.enum(PAYMENT_METHODS),
    payment_date: date.nullable(),
    is_deposit: z.boolean(),
    received_by: z.string().max(200).nullable(),
    notes: z.string().max(1000).nullable(),
  })
  .partial()
  .strict()

export function paymentPatchToRow(patch: z.infer<typeof PaymentPatch>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  const copy = ['method', 'payment_date', 'is_deposit', 'received_by', 'notes'] as const
  for (const k of copy) if (patch[k] !== undefined) row[k] = patch[k]
  if (patch.amount !== undefined) row.amount_agorot = toMinor(patch.amount)
  return row
}

export function serializePayment(p: Record<string, unknown>) {
  return {
    id: p.id,
    amount: toMajor(p.amount_agorot as number),
    currency: p.currency,
    method: p.method,
    payment_date: p.payment_date,
    is_deposit: p.is_deposit,
    received_by: p.received_by,
    notes: p.notes,
    created_at: p.created_at,
  }
}

/** A guest payment on this booking (commission payments are not editable here). */
export async function loadPayment(db: ServiceClient, bookingId: string, paymentId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from('booking_payments')
    .select('*')
    .eq('id', paymentId)
    .eq('booking_id', bookingId)
    .eq('is_commission', false)
    .maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Payment not found.')
  return data as Record<string, unknown>
}

/**
 * Re-derive payment_status after a payment is added, edited or removed.
 * Leaves it alone when the booking amount is unknown.
 */
export async function syncPaymentStatus(db: ServiceClient, bookingId: string): Promise<{ paid: number; status: string }> {
  const { data: booking } = await db.from('bookings').select('gross_rental_agorot, payment_status').eq('id', bookingId).maybeSingle()
  const paid = (await amountsPaid(db, [bookingId])).get(bookingId) ?? 0
  const derived = derivedPaymentStatus((booking?.gross_rental_agorot as number | null) ?? null, paid)
  if (derived && derived !== booking?.payment_status) {
    await db.from('bookings').update({ payment_status: derived }).eq('id', bookingId)
  }
  return { paid, status: derived ?? (booking?.payment_status as string) ?? 'pending' }
}
