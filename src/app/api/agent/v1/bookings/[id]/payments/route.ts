import { z } from 'zod'
import { AgentError, json, readJson, toMajor, toMinor, withAgent } from '@/lib/agent-api/core'
import { amountsPaid, derivedPaymentStatus, loadBooking } from '@/lib/agent-api/bookings'

export const dynamic = 'force-dynamic'

type Params = { id: string }

const PaymentCreate = z
  .object({
    amount: z.number().positive(),
    method: z.enum(['bank_transfer', 'cash', 'bit', 'credit_card', 'paypal', 'check', 'other']).default('bank_transfer'),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish(),
    is_deposit: z.boolean().default(false),
    received_by: z.string().max(200).nullish(),
    notes: z.string().max(1000).nullish(),
  })
  .strict()

function serializePayment(p: Record<string, unknown>) {
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

/** GET /api/agent/v1/bookings/:id/payments — guest payments recorded on the booking. */
export const GET = withAgent<Params>('bookings:read', async (_request, { db }, { id }) => {
  await loadBooking(db, id)
  const { data, error } = await db
    .from('booking_payments')
    .select('*')
    .eq('booking_id', id)
    .eq('is_commission', false)
    .order('payment_date', { ascending: true })
  if (error) throw new AgentError(500, error.message)
  return json({ payments: (data ?? []).map(serializePayment) })
})

/**
 * POST /api/agent/v1/bookings/:id/payments — record money received, in the
 * booking's currency. Updates payment_status (pending/partial/complete) when
 * the booking amount is known.
 */
export const POST = withAgent<Params>('bookings:write', async (request, { db, audit }, { id }) => {
  const body = PaymentCreate.parse(await readJson(request))
  const booking = await loadBooking(db, id)

  const { data: payment, error } = await db
    .from('booking_payments')
    .insert({
      booking_id: id,
      amount_agorot: toMinor(body.amount),
      currency: booking.currency ?? 'ILS',
      method: body.method,
      payment_date: body.payment_date ?? new Date().toISOString().split('T')[0],
      is_deposit: body.is_deposit,
      received_by: body.received_by ?? null,
      notes: body.notes ?? null,
    })
    .select('*')
    .single()
  if (error || !payment) throw new AgentError(400, error?.message ?? 'Insert failed')

  const paid = (await amountsPaid(db, [id])).get(id) ?? 0
  const status = derivedPaymentStatus(booking.gross_rental_agorot as number | null, paid)
  if (status && status !== booking.payment_status) {
    await db.from('bookings').update({ payment_status: status }).eq('id', id)
  }

  const result = { payment: serializePayment(payment), amount_paid: toMajor(paid), payment_status: status ?? booking.payment_status }
  await audit({ resource: 'booking_payment', resourceId: payment.id, action: 'create', after: { booking_id: id, ...result } })
  return json(result, 201)
})
