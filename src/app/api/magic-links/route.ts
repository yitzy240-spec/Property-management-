import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateMagicLinkToken } from '@/lib/magic-links'
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
    expires_in_hours = 72,
  } = body as {
    property_id: string
    task_id?: string
    task_ids?: string[]
    contractor_id?: string
    booking_id?: string
    link_type: MagicLinkType
    send_email?: boolean
    expires_in_hours?: number
  }

  if (!property_id || !link_type) {
    return NextResponse.json(
      { error: 'property_id and link_type are required' },
      { status: 400 }
    )
  }

  try {
    const token = await generateMagicLinkToken(
      { property_id, task_id, contractor_id, booking_id, link_type },
      expires_in_hours
    )

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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const prefix = link_type === 'guest' ? 'guest' : 'contractor'
    const url = `${baseUrl}/${prefix}/${token}`

    // Auto-send email if requested
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
          // Get task title
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
            taskTitle = (tasks ?? []).map(t => t.title).join(', ')
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
          )
          emailSent = true
        }
      }
    }

    return NextResponse.json({
      token,
      url,
      expires_at: expiresAt.toISOString(),
      email_sent: emailSent,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate magic link' },
      { status: 500 }
    )
  }
}
