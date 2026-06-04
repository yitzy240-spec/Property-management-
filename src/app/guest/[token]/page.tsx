export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { ShieldOff } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyMagicLinkToken } from '@/lib/magic-links'
import { GuestCheckIn } from '@/components/features/guest-check-in'
import { getCanvaEmbedUrl } from '@/lib/canva'

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
      .select('id, expires_at, code_reveals_at, is_used')
      .eq('token', params.token)
      .single()

    if (!magicLink) notFound()

    // DB-backed expiry check (overrides the JWT exp claim, which is a far-future placeholder when DB expires_at is null).
    if (magicLink.expires_at && new Date() > new Date(magicLink.expires_at)) {
      throw new Error('expired')
    }

    const { data: property } = await serviceClient
      .from('properties')
      .select('name, address, neighborhood, city, entry_code, building_entry_code, youtube_tutorial_url, canva_design_url')
      .eq('id', payload.property_id)
      .single()

    if (!property) notFound()

    let booking = null
    if (payload.booking_id) {
      const { data } = await serviceClient
        .from('bookings')
        .select('check_in, check_out, guest_name, guest_language')
        .eq('id', payload.booking_id)
        .single()
      booking = data
    }

    // Reveal gate: if code_reveals_at is null, reveal immediately. Otherwise wait until that timestamp.
    const codeIsRevealed =
      magicLink.code_reveals_at === null ||
      new Date() >= new Date(magicLink.code_reveals_at)

    const entryCode = codeIsRevealed ? property.entry_code : null
    const buildingEntryCode = codeIsRevealed ? property.building_entry_code : null

    let guideText: string | null = null
    try {
      const lang = (booking as Record<string, unknown>)?.guest_language as string || 'en'
      const guideRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/guest-guide?property_id=${payload.property_id}&lang=${lang}`,
        { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } },
      )
      if (guideRes.ok) {
        const guideData = await guideRes.json()
        guideText = guideData.content
      }
    } catch {
      // Guide fetch failed — page still works without it
    }

    return (
      <GuestCheckIn
        property={{ ...property, entry_code: entryCode, building_entry_code: buildingEntryCode }}
        booking={booking}
        guideText={guideText}
        canvaEmbedUrl={getCanvaEmbedUrl(property.canva_design_url)}
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
