import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  generateMagicLinkToken,
  validateRevealAndExpiry,
} from '@/lib/magic-links'
import { requireAdmin, AuthError } from '@/lib/auth'
import { sendContractorMagicLink, sendGuestCheckInLink } from '@/lib/email'
import type { MagicLinkType } from '@/types'

/** POST /api/magic-links — Generate a new magic link and optionally email it */
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
    task_ids,
    contractor_id,
    booking_id,
    link_type,
    send_email = true,
    expires_at: expiresAtRaw = null,
    code_reveals_at: codeRevealsAtRaw = null,
  } = body as {
    property_id: string
    task_id?: string
    task_ids?: string[]
    contractor_id?: string
    booking_id?: string
    link_type: MagicLinkType
    send_email?: boolean
    expires_at?: string | null
    code_reveals_at?: string | null
  }

  if (!property_id || !link_type) {
    return NextResponse.json(
      { error: 'property_id and link_type are required' },
      { status: 400 }
    )
  }

  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null
  const codeRevealsAt = codeRevealsAtRaw ? new Date(codeRevealsAtRaw) : null

  try {
    validateRevealAndExpiry(codeRevealsAt, expiresAt)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid reveal/expiry' },
      { status: 400 },
    )
  }

  // JWT exp: if expires_at is null, use a far-future expiry; the DB row is the actual gate.
  const TEN_YEARS_HOURS = 24 * 365 * 10
  const expiresInHoursForJwt = expiresAt
    ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)))
    : TEN_YEARS_HOURS

  try {
    const token = await generateMagicLinkToken(
      { property_id, task_id, contractor_id, booking_id, link_type },
      expiresInHoursForJwt,
    )

    const serviceClient = createServiceClient()

    const { error: dbError } = await serviceClient
      .from('magic_links')
      .insert({
        token,
        link_type,
        property_id,
        task_id: task_id || null,
        contractor_id: contractor_id || null,
        booking_id: booking_id || null,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        code_reveals_at: codeRevealsAt ? codeRevealsAt.toISOString() : null,
      })

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const prefix = link_type === 'guest' ? 'guest' : 'contractor'
    const url = `${baseUrl}/${prefix}/${token}`

    let emailSent = false
    if (send_email) {
      const { data: property } = await serviceClient
        .from('properties')
        .select('name')
        .eq('id', property_id)
        .single()

      const propertyName = property?.name || 'Property'

      if (link_type === 'contractor' && contractor_id) {
        const { data: contractor } = await serviceClient
          .from('contractors')
          .select('name, email')
          .eq('id', contractor_id)
          .single()

        if (contractor?.email) {
          let taskTitle = 'Task Assignment'
          if (task_id) {
            const { data: task } = await serviceClient
              .from('tasks')
              .select('title')
              .eq('id', task_id)
              .single()
            taskTitle = task?.title || taskTitle
          } else if (task_ids?.length) {
            const { data: tasks } = await serviceClient
              .from('tasks')
              .select('title')
              .in('id', task_ids)
            taskTitle = (tasks ?? []).map((t) => t.title).join(', ')
          }

          await sendContractorMagicLink(
            contractor.email,
            contractor.name,
            propertyName,
            taskTitle,
            url,
          )
          emailSent = true
        }
      }

      if (link_type === 'guest' && booking_id) {
        const { data: booking } = await serviceClient
          .from('bookings')
          .select('guest_name, check_in, guest_email')
          .eq('id', booking_id)
          .single()

        if (booking?.guest_email) {
          await sendGuestCheckInLink(
            booking.guest_email,
            booking.guest_name || 'Guest',
            propertyName,
            booking.check_in,
            url,
            codeRevealsAt,
          )
          emailSent = true
        }
      }
    }

    return NextResponse.json({
      token,
      url,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      code_reveals_at: codeRevealsAt ? codeRevealsAt.toISOString() : null,
      email_sent: emailSent,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate magic link' },
      { status: 500 },
    )
  }
}
