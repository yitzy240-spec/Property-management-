import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyMagicLinkToken } from '@/lib/magic-links'
import { GuestCheckIn } from '@/components/features/guest-check-in'

export default async function GuestCheckInPage({
  params,
}: {
  params: { token: string }
}) {
  try {
    const payload = await verifyMagicLinkToken(params.token)

    if (payload.link_type !== 'guest') {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">Invalid link type.</p>
        </div>
      )
    }

    const serviceClient = createServiceClient()

    // Verify magic link is valid
    const { data: magicLink } = await serviceClient
      .from('magic_links')
      .select('*')
      .eq('token', params.token)
      .single()

    if (!magicLink) notFound()

    // Get property
    const { data: property } = await serviceClient
      .from('properties')
      .select('name, address, neighborhood, city, entry_code, youtube_tutorial_url, canva_design_url')
      .eq('id', payload.property_id)
      .single()

    if (!property) notFound()

    // Get booking for time-gating the entry code
    let booking = null
    if (payload.booking_id) {
      const { data } = await serviceClient
        .from('bookings')
        .select('check_in, check_out, guest_name')
        .eq('id', payload.booking_id)
        .single()
      booking = data
    }

    // SERVER-SIDE time gate: never send entry_code to client until 24h before check-in
    let entryCode: string | null = null
    if (booking) {
      const checkInDate = new Date(booking.check_in + 'T14:00:00+03:00') // 2pm Jerusalem
      const gateOpens = new Date(checkInDate.getTime() - 24 * 60 * 60 * 1000)
      if (new Date() >= gateOpens) {
        entryCode = property.entry_code
      }
    } else {
      // No booking context = admin preview, show code
      entryCode = property.entry_code
    }

    return (
      <GuestCheckIn
        property={{ ...property, entry_code: entryCode }}
        booking={booking}
      />
    )
  } catch {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is invalid or has expired. Contact your host for assistance.
          </p>
        </div>
      </div>
    )
  }
}
