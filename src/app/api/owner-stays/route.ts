import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * POST /api/owner-stays
 *
 * Owner requests a personal stay — creates a booking with platform='owner_stay'
 * and notifies the admin (via the booking appearing in the system).
 */
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get owner record
  const { data: owner } = await supabase
    .from('owners')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!owner) {
    return NextResponse.json({ error: 'Owner not found' }, { status: 404 })
  }

  const { property_id, check_in, check_out } = await request.json()

  if (!property_id || !check_in || !check_out) {
    return NextResponse.json(
      { error: 'property_id, check_in, and check_out are required' },
      { status: 400 }
    )
  }

  // Validate dates
  if (new Date(check_in) >= new Date(check_out)) {
    return NextResponse.json({ error: 'check_out must be after check_in' }, { status: 400 })
  }

  // Verify owner owns this property
  const { data: property } = await supabase
    .from('properties')
    .select('id, name')
    .eq('id', property_id)
    .eq('owner_id', owner.id)
    .single()

  if (!property) {
    return NextResponse.json({ error: 'Property not found or not yours' }, { status: 403 })
  }

  // Check for booking conflicts
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('id, guest_name, check_in, check_out')
    .eq('property_id', property_id)
    .lt('check_in', check_out)
    .gt('check_out', check_in)

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      {
        error: 'Date conflict with existing booking',
        conflicts: conflicts.map(c => ({
          guest: c.guest_name,
          dates: `${c.check_in} → ${c.check_out}`,
        })),
      },
      { status: 409 }
    )
  }

  // Create the owner stay booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      property_id,
      platform: 'owner_stay',
      guest_name: `${owner.full_name} (Owner Stay)`,
      check_in,
      check_out,
    })
    .select('id')
    .single()

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    booking_id: booking.id,
    message: `Stay requested at ${property.name}: ${check_in} → ${check_out}. Your manager has been notified.`,
  })
}
