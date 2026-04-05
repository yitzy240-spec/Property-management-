import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { pushKeyCodes } from '@/lib/lodgify'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/lodgify/keycodes
 * Push entry code to Lodgify for a specific booking.
 * Body: { booking_id: "uuid" }
 *
 * Reads the entry_code from the property and pushes it to the Lodgify booking.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { booking_id } = await request.json()
  if (!booking_id) {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const { data: booking } = await serviceClient
    .from('bookings')
    .select('external_id, property_id, properties(entry_code)')
    .eq('id', booking_id)
    .single()

  if (!booking?.external_id?.startsWith('lodgify_')) {
    return NextResponse.json({ error: 'Not a Lodgify booking' }, { status: 400 })
  }

  const props = booking.properties as unknown as { entry_code: string | null } | null
  const entryCode = props?.entry_code
  if (!entryCode) {
    return NextResponse.json({ error: 'No entry code set for this property' }, { status: 400 })
  }

  const lodgifyBookingId = booking.external_id.replace('lodgify_', '')

  try {
    await pushKeyCodes(lodgifyBookingId, [entryCode])
    return NextResponse.json({ success: true, code: entryCode })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to push key code' },
      { status: 500 }
    )
  }
}
