import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { PaymentPatch, paymentPatchToRow, syncPaymentStatus } from '@/lib/agent-api/bookings'

type Params = { params: { id: string; paymentId: string } }

async function authorize(): Promise<NextResponse | null> {
  try {
    await requireAdmin()
    return null
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/** Guest payment on this booking, or null (commission payments are not editable here). */
async function findPayment(db: ReturnType<typeof createServiceClient>, bookingId: string, paymentId: string) {
  const { data } = await db
    .from('booking_payments')
    .select('id')
    .eq('id', paymentId)
    .eq('booking_id', bookingId)
    .eq('is_commission', false)
    .maybeSingle()
  return data
}

/** PATCH /api/bookings/:id/payments/:paymentId  (admin only) — correct a payment. */
export async function PATCH(request: Request, { params }: Params) {
  const denied = await authorize()
  if (denied) return denied

  let row: Record<string, unknown>
  try {
    row = paymentPatchToRow(PaymentPatch.parse(await request.json()))
  } catch (err) {
    const message = err instanceof ZodError ? err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : 'Invalid JSON'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  if (Object.keys(row).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const db = createServiceClient()
  if (!(await findPayment(db, params.id, params.paymentId))) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
  const { error } = await db.from('booking_payments').update(row).eq('id', params.paymentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { status } = await syncPaymentStatus(db, params.id)
  return NextResponse.json({ success: true, payment_status: status })
}

/** DELETE /api/bookings/:id/payments/:paymentId  (admin only) — remove a duplicate or mistaken payment. */
export async function DELETE(_request: Request, { params }: Params) {
  const denied = await authorize()
  if (denied) return denied

  const db = createServiceClient()
  if (!(await findPayment(db, params.id, params.paymentId))) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
  const { error } = await db.from('booking_payments').delete().eq('id', params.paymentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { status } = await syncPaymentStatus(db, params.id)
  return NextResponse.json({ success: true, payment_status: status })
}
