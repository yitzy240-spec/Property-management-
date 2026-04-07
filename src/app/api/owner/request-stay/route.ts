import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { blockDates } from '@/lib/lodgify'
import { requireAuth, AuthError } from '@/lib/auth'
import { notifyAdmins } from '@/lib/notifications'

/**
 * POST /api/owner/request-stay
 * Owner requests to block dates for personal stay.
 * Creates a booking record and notifies the admin.
 */
export async function POST(request: Request) {
  try {
    await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { property_id, check_in, check_out, notes } = await request.json()

  if (!property_id || !check_in || !check_out) {
    return NextResponse.json({ error: 'Property, check-in, and check-out dates required' }, { status: 400 })
  }

  // Verify user owns this property
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: owner } = await supabase
    .from('owners')
    .select('id, full_name')
    .eq('auth_user_id', user!.id)
    .single()

  if (!owner) {
    return NextResponse.json({ error: 'Owner not found' }, { status: 403 })
  }

  const serviceClient = createServiceClient()

  const { data: property } = await serviceClient
    .from('properties')
    .select('id, name, owner_id, lodgify_property_id')
    .eq('id', property_id)
    .single()

  if (!property || property.owner_id !== owner.id) {
    return NextResponse.json({ error: 'Property not found or not owned' }, { status: 403 })
  }

  // Validate dates
  if (new Date(check_in) >= new Date(check_out)) {
    return NextResponse.json({ error: 'Check-out must be after check-in' }, { status: 400 })
  }

  // Check for booking conflicts
  const { data: conflicts } = await serviceClient
    .from('bookings')
    .select('id, guest_name, check_in, check_out')
    .eq('property_id', property_id)
    .lt('check_in', check_out)
    .gt('check_out', check_in)

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({
      error: 'Date conflict with existing booking',
      conflicts: conflicts.map(c => ({
        guest: c.guest_name,
        dates: `${c.check_in} → ${c.check_out}`,
      })),
    }, { status: 409 })
  }

  // Create an owner-stay booking
  const { error: bookingError } = await serviceClient
    .from('bookings')
    .insert({
      property_id,
      platform: 'owner_stay',
      guest_name: `${owner.full_name} (Owner Stay)`,
      check_in,
      check_out,
      external_id: `owner_stay_${Date.now()}`,
    })

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  // Block dates in Lodgify so OTAs don't double-book
  if (property.lodgify_property_id) {
    try {
      await blockDates(parseInt(property.lodgify_property_id), check_in, check_out, false)
    } catch {
      // Non-critical — dates blocked locally even if Lodgify fails
    }
  }

  // Notify admin in-app
  await notifyAdmins({
    title: `Owner stay request — ${property.name}`,
    body: `${owner.full_name}: ${check_in} → ${check_out}`,
    link: `/properties/${property.id}`,
  })

  // Notify admin via email
  await sendEmail({
    to: process.env.ADMIN_EMAIL || 'admin@marcus-properties.com',
    subject: `Owner Stay Request — ${property.name}`,
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1E3A5F;">Owner Stay Request</h2>
        <p><strong>${owner.full_name}</strong> wants to stay at <strong>${property.name}</strong></p>
        <p>Check-in: <strong>${check_in}</strong><br/>Check-out: <strong>${check_out}</strong></p>
        ${notes ? `<p>Notes: ${notes}</p>` : ''}
        <p style="color: #9CA3AF; font-size: 12px; margin-top: 16px;">— ApartmentOS</p>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
