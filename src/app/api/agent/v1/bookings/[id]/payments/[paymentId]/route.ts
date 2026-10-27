import { AgentError, json, readJson, refreshAdminPages, toMajor, withAgent } from '@/lib/agent-api/core'
import {
  PaymentPatch,
  loadBooking,
  loadPayment,
  paymentPatchToRow,
  serializePayment,
  syncPaymentStatus,
} from '@/lib/agent-api/bookings'

export const dynamic = 'force-dynamic'

type Params = { id: string; paymentId: string }

/**
 * PATCH /api/agent/v1/bookings/:id/payments/:paymentId — fix a payment that
 * was recorded wrong (amount, method, date, deposit flag, notes).
 */
export const PATCH = withAgent<Params>('bookings:write', async (request, { db, audit }, { id, paymentId }) => {
  const patch = PaymentPatch.parse(await readJson(request))
  const booking = await loadBooking(db, id)
  const before = await loadPayment(db, id, paymentId)

  const row = paymentPatchToRow(patch)
  if (Object.keys(row).length === 0) throw new AgentError(400, 'No fields to update.')
  const { error } = await db.from('booking_payments').update(row).eq('id', paymentId)
  if (error) throw new AgentError(400, error.message)

  const after = await loadPayment(db, id, paymentId)
  const { paid, status } = await syncPaymentStatus(db, id)
  const result = { payment: serializePayment(after), amount_paid: toMajor(paid), payment_status: status }
  await audit({ resource: 'booking_payment', resourceId: paymentId, action: 'update', before: serializePayment(before), after: result })
  refreshAdminPages(`/properties/${booking.property_id}`, '/financials')
  return json(result)
})

/** DELETE /api/agent/v1/bookings/:id/payments/:paymentId — remove a duplicate or mistaken payment. */
export const DELETE = withAgent<Params>('bookings:write', async (_request, { db, audit }, { id, paymentId }) => {
  const booking = await loadBooking(db, id)
  const before = await loadPayment(db, id, paymentId)

  const { error } = await db.from('booking_payments').delete().eq('id', paymentId)
  if (error) throw new AgentError(400, error.message)

  const { paid, status } = await syncPaymentStatus(db, id)
  await audit({ resource: 'booking_payment', resourceId: paymentId, action: 'delete', before: serializePayment(before) })
  refreshAdminPages(`/properties/${booking.property_id}`, '/financials')
  return json({ deleted: true, id: paymentId, amount_paid: toMajor(paid), payment_status: status })
})
