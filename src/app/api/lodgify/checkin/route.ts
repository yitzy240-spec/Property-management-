import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkinBooking, checkoutBooking } from '@/lib/lodgify'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/lodgify/checkin
 * Mark a booking as checked-in or checked-out in Lodgify.
 * Body: { booking_id: "uuid", action: "checkin" | "checkout" }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { booking_id, action } = await request.json()

  if (!booking_id || !['checkin', 'checkout'].includes(action)) {
    return NextResponse.json({ error: 'booking_id and action (checkin/checkout) required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const { data: booking } = await serviceClient
    .from('bookings')
    .select('external_id')
    .eq('id', booking_id)
    .single()

  if (!booking?.external_id?.startsWith('lodgify_')) {
    return NextResponse.json({ error: 'Not a Lodgify booking' }, { status: 400 })
  }

  const lodgifyBookingId = booking.external_id.replace('lodgify_', '')

  try {
    if (action === 'checkin') {
      await checkinBooking(lodgifyBookingId)
    } else {
      await checkoutBooking(lodgifyBookingId)
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
