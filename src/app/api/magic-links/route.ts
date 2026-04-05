import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateMagicLinkToken } from '@/lib/magic-links'
import { requireAdmin, AuthError } from '@/lib/auth'
import type { MagicLinkType } from '@/types'

/** POST /api/magic-links — Generate a new magic link */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    property_id,
    task_id,
    contractor_id,
    booking_id,
    link_type,
    expires_in_hours = 72,
  } = body as {
    property_id: string
    task_id?: string
    contractor_id?: string
    booking_id?: string
    link_type: MagicLinkType
    expires_in_hours?: number
  }

  if (!property_id || !link_type) {
    return NextResponse.json(
      { error: 'property_id and link_type are required' },
      { status: 400 }
    )
  }

  try {
    // Generate JWT
    const token = await generateMagicLinkToken(
      { property_id, task_id, contractor_id, booking_id, link_type },
      expires_in_hours
    )

    // Store in magic_links table (service client bypasses RLS)
    const serviceClient = createServiceClient()
    const expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000)

    const { error: dbError } = await serviceClient
      .from('magic_links')
      .insert({
        token,
        link_type,
        property_id,
        task_id: task_id || null,
        contractor_id: contractor_id || null,
        booking_id: booking_id || null,
        expires_at: expiresAt.toISOString(),
      })

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Build the full URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const prefix = link_type === 'guest' ? 'guest' : 'contractor'
    const url = `${baseUrl}/${prefix}/${token}`

    return NextResponse.json({ token, url, expires_at: expiresAt.toISOString() })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate magic link' },
      { status: 500 }
    )
  }
}
