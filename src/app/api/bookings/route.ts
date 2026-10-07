import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createBooking } from '@/lib/bookings'

/**
 * POST /api/bookings
 * Create a booking locally AND push to Lodgify if property is linked.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    property_id, guest_name, check_in, check_out, platform,
    gross_rental_agorot, channel_fees_agorot, currency, original_amount_cents,
    exchange_rate, deposit_amount_agorot, notes,
  } = body

  if (!property_id || !check_in || !check_out) {
    return NextResponse.json({ error: 'property_id, check_in, check_out required' }, { status: 400 })
  }

  const result = await createBooking(createServiceClient(), {
    property_id, guest_name, check_in, check_out, platform,
    gross_rental_agorot, channel_fees_agorot, currency, original_amount_cents,
    exchange_rate, deposit_amount_agorot, notes,
  })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    booking_id: result.id,
    lodgify: result.lodgify,
  })
}
