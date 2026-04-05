import { notFound } from 'next/navigation'
import { ShieldOff } from 'lucide-react'
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
        <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] p-4">
          <p className="text-sm text-muted-foreground">Invalid link type.</p>
        </div>
      )
    }

    const serviceClient = createServiceClient()

    const { data: magicLink } = await serviceClient
      .from('magic_links')
      .select('*')
      .eq('token', params.token)
      .single()

    if (!magicLink) notFound()

    const { data: property } = await serviceClient
      .from('properties')
      .select('name, address, neighborhood, city, entry_code, youtube_tutorial_url, canva_design_url')
      .eq('id', payload.property_id)
      .single()

    if (!property) notFound()

    let booking = null
    if (payload.booking_id) {
      const { data } = await serviceClient
        .from('bookings')
        .select('check_in, check_out, guest_name')
        .eq('id', payload.booking_id)
        .single()
      booking = data
    }

    // SERVER-SIDE time gate
    let entryCode: string | null = null
    if (booking) {
      const checkInDate = new Date(booking.check_in + 'T14:00:00+03:00')
      const gateOpens = new Date(checkInDate.getTime() - 24 * 60 * 60 * 1000)
      if (new Date() >= gateOpens) {
        entryCode = property.entry_code
      }
    } else {
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
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] bg-muted">
            <ShieldOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">Invalid Link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is invalid or has expired. Contact your host for assistance.
          </p>
        </div>
      </div>
    )
  }
}
