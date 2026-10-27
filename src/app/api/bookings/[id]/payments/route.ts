import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { toMinor } from '@/lib/agent-api/core'
import { PaymentCreate, syncPaymentStatus } from '@/lib/agent-api/bookings'
import { jerusalemToday } from '@/lib/cleaning-schedule'

/**
 * POST /api/bookings/:id/payments  (admin only)
 * Record a guest payment, in major units of the booking currency.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = PaymentCreate.parse(await request.json())
  } catch (err) {
    const message = err instanceof ZodError ? err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : 'Invalid JSON'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: booking } = await db.from('bookings').select('id, currency').eq('id', params.id).maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const { data: payment, error } = await db
    .from('booking_payments')
    .insert({
      booking_id: params.id,
      amount_agorot: toMinor(body.amount),
      currency: booking.currency ?? 'ILS',
      method: body.method,
      payment_date: body.payment_date ?? jerusalemToday(),
      is_deposit: body.is_deposit,
      received_by: body.received_by ?? null,
      notes: body.notes ?? null,
    })
    .select('id')
    .single()
  if (error || !payment) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })

  const { status } = await syncPaymentStatus(db, params.id)
  return NextResponse.json({ success: true, id: payment.id, payment_status: status })
}
