import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/webhooks/lodgify
 * Receives real-time webhook events from Lodgify.
 * Triggers immediate booking sync for the affected property.
 *
 * Events: booking_new_any_status, booking_change, availability_change, etc.
 */
export async function POST(request: Request) {
  // Lodgify sends x-lodgify-signature for HMAC verification
  // For now, accept all — TODO: verify signature with stored webhook secret

  const body = await request.json()
  const event = body.event || body.Event
  const propertyId = body.property_id || body.PropertyId

  if (!event) {
    return NextResponse.json({ error: 'No event type' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  try {
    switch (event) {
      case 'booking_new_any_status':
      case 'booking_new_status_booked':
      case 'booking_change':
      case 'booking_status_change_booked': {
        // A booking was created or changed — sync it immediately
        const bookingData = body.data || body
        const lodgifyBookingId = bookingData.id || bookingData.booking_id

        if (!lodgifyBookingId || !propertyId) break

        // Find our property
        const { data: property } = await serviceClient
          .from('properties')
          .select('id, commission_rate')
          .eq('lodgify_property_id', String(propertyId))
          .single()

        if (!property) break

        const platform = mapSource(bookingData.source)
        const grossAgorot = bookingData.total_amount ? Math.round(bookingData.total_amount * 100) : null

        await serviceClient
          .from('bookings')
          .upsert({
            property_id: property.id,
            platform,
            external_id: `lodgify_${lodgifyBookingId}`,
            guest_name: bookingData.guest?.name || bookingData.guest_name || null,
            check_in: bookingData.arrival || bookingData.check_in,
            check_out: bookingData.departure || bookingData.check_out,
            gross_rental_agorot: grossAgorot,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'property_id,external_id' })

        break
      }

      case 'booking_status_change_declined': {
        // Booking cancelled — mark in our DB
        const lodgifyBookingId = body.data?.id || body.booking_id
        if (lodgifyBookingId) {
          await serviceClient
            .from('bookings')
            .update({ platform: 'cancelled' })
            .eq('external_id', `lodgify_${lodgifyBookingId}`)
        }
        break
      }

      case 'availability_change':
        // Availability changed — could trigger calendar refresh
        // For now, just log it. The next cron sync will pick it up.
        break

      case 'guest_message_received':
        // Guest sent a message — could trigger notification
        break
    }

    return NextResponse.json({ received: true, event })
  } catch (err) {
    console.error('[Lodgify Webhook]', err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

function mapSource(source: string | null): string {
  if (!source) return 'direct'
  const s = source.toLowerCase()
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('booking.com') || s.includes('booking')) return 'booking_com'
  if (s.includes('vrbo')) return 'vrbo'
  return 'other'
}
