import { AgentError, json, readJson, refreshAdminPages, toMajor, toMinor, withAgent } from '@/lib/agent-api/core'
import { PaymentCreate, loadBooking, serializePayment, syncPaymentStatus } from '@/lib/agent-api/bookings'
import { jerusalemToday } from '@/lib/cleaning-schedule'

export const dynamic = 'force-dynamic'

type Params = { id: string }

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
      payment_date: body.payment_date ?? jerusalemToday(),
      is_deposit: body.is_deposit,
      received_by: body.received_by ?? null,
      notes: body.notes ?? null,
    })
    .select('*')
    .single()
  if (error || !payment) throw new AgentError(400, error?.message ?? 'Insert failed')

  const { paid, status } = await syncPaymentStatus(db, id)
  const result = { payment: serializePayment(payment), amount_paid: toMajor(paid), payment_status: status }
  await audit({ resource: 'booking_payment', resourceId: payment.id, action: 'create', after: { booking_id: id, ...result } })
  refreshAdminPages(`/properties/${booking.property_id}`, '/financials')
  return json(result, 201)
})
