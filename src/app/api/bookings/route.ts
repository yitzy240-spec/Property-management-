import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

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

  const serviceClient = createServiceClient()

  // Get property to check Lodgify link
  const { data: property } = await serviceClient
    .from('properties')
    .select('lodgify_property_id')
    .eq('id', property_id)
    .single()

  // Save locally
  const { data: booking, error: dbError } = await serviceClient
    .from('bookings')
    .insert({
      property_id,
      guest_name: guest_name || null,
      check_in,
      check_out,
      platform: platform || 'direct',
      gross_rental_agorot: gross_rental_agorot || null,
      channel_fees_agorot: channel_fees_agorot || null,
      currency: currency || 'ILS',
      original_amount_cents: original_amount_cents || null,
      exchange_rate: exchange_rate || null,
      deposit_amount_agorot: deposit_amount_agorot || null,
      payment_status: 'pending',
      notes: notes || null,
    })
    .select('id')
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Push to Lodgify if property is linked
  let lodgifyResult = null
  if (property?.lodgify_property_id) {
    try {
      const LODGIFY_KEY = process.env.LODGIFY_API_KEY
      if (LODGIFY_KEY) {
        // Get room type ID
        const propRes = await fetch(`https://api.lodgify.com/v2/properties/${property.lodgify_property_id}`, {
          headers: { 'X-ApiKey': LODGIFY_KEY, Accept: 'application/json' },
        })
        const propData = await propRes.json()
        const roomTypeId = propData.rooms?.[0]?.id

        if (roomTypeId) {
          const lodgifyRes = await fetch('https://api.lodgify.com/v1/reservation/booking', {
            method: 'POST',
            headers: { 'X-ApiKey': LODGIFY_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property_id: parseInt(property.lodgify_property_id),
              room_type_id: roomTypeId,
              arrival: check_in,
              departure: check_out,
              guest_name: guest_name || 'Direct Booking',
              source: 'Manual',
              status: 'Booked',
            }),
          })

          if (lodgifyRes.ok) {
            const lodgifyData = await lodgifyRes.json()
            // Link the Lodgify booking ID
            await serviceClient
              .from('bookings')
              .update({ external_id: `lodgify_${lodgifyData.id}`, synced_at: new Date().toISOString() })
              .eq('id', booking.id)
            lodgifyResult = { synced: true, lodgify_id: lodgifyData.id }
          } else {
            const errText = await lodgifyRes.text()
            lodgifyResult = { synced: false, error: errText.substring(0, 200) }
          }
        }
      }
    } catch (err) {
      lodgifyResult = { synced: false, error: err instanceof Error ? err.message : 'Unknown' }
    }
  }

  return NextResponse.json({
    success: true,
    booking_id: booking.id,
    lodgify: lodgifyResult,
  })
}
