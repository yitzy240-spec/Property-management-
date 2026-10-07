import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Fields for a new booking. Amounts are in the smallest unit of `currency`. */
export interface NewBooking {
  property_id: string
  check_in: string
  check_out: string
  guest_name?: string | null
  guest_email?: string | null
  guest_phone?: string | null
  platform?: string | null
  gross_rental_agorot?: number | null
  channel_fees_agorot?: number | null
  currency?: string | null
  original_amount_cents?: number | null
  exchange_rate?: number | null
  deposit_amount_agorot?: number | null
  payment_status?: string | null
  notes?: string | null
}

export type LodgifyPushResult = { synced: true; lodgify_id: unknown } | { synced: false; error: string } | null

/**
 * Create a booking locally AND push it to Lodgify when the property is linked
 * (so the dates are blocked there). Shared by the admin form and the agent API.
 */
export async function createBooking(
  serviceClient: ServiceClient,
  input: NewBooking,
): Promise<{ id: string; lodgify: LodgifyPushResult } | { error: string }> {
  const { data: property } = await serviceClient
    .from('properties')
    .select('lodgify_property_id')
    .eq('id', input.property_id)
    .single()

  const { data: booking, error: dbError } = await serviceClient
    .from('bookings')
    .insert({
      property_id: input.property_id,
      guest_name: input.guest_name || null,
      guest_email: input.guest_email || null,
      guest_phone: input.guest_phone || null,
      check_in: input.check_in,
      check_out: input.check_out,
      platform: input.platform || 'direct',
      gross_rental_agorot: input.gross_rental_agorot || null,
      channel_fees_agorot: input.channel_fees_agorot || null,
      currency: input.currency || 'ILS',
      original_amount_cents: input.original_amount_cents || null,
      exchange_rate: input.exchange_rate || null,
      deposit_amount_agorot: input.deposit_amount_agorot || null,
      payment_status: input.payment_status || 'pending',
      notes: input.notes || null,
    })
    .select('id')
    .single()

  if (dbError || !booking) return { error: dbError?.message ?? 'Insert failed' }

  let lodgify: LodgifyPushResult = null
  if (property?.lodgify_property_id) {
    try {
      const LODGIFY_KEY = process.env.LODGIFY_API_KEY
      if (LODGIFY_KEY) {
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
              arrival: input.check_in,
              departure: input.check_out,
              guest_name: input.guest_name || 'Direct Booking',
              source: 'Manual',
              status: 'Booked',
            }),
          })

          if (lodgifyRes.ok) {
            const lodgifyData = await lodgifyRes.json()
            await serviceClient
              .from('bookings')
              .update({ external_id: `lodgify_${lodgifyData.id}`, synced_at: new Date().toISOString() })
              .eq('id', booking.id)
            lodgify = { synced: true, lodgify_id: lodgifyData.id }
          } else {
            const errText = await lodgifyRes.text()
            lodgify = { synced: false, error: errText.substring(0, 200) }
          }
        }
      }
    } catch (err) {
      lodgify = { synced: false, error: err instanceof Error ? err.message : 'Unknown' }
    }
  }

  return { id: booking.id, lodgify }
}

/** Where a booking came from. Synced bookings are overwritten by the next sync. */
export function bookingSource(b: { external_id?: string | null; ical_uid?: string | null }): 'lodgify' | 'ical' | 'manual' {
  if (typeof b.external_id === 'string' && b.external_id.startsWith('lodgify_')) return 'lodgify'
  if (b.ical_uid) return 'ical'
  return 'manual'
}
