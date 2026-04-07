import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAuth, AuthError } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { createNotification, notifyAdmins } from '@/lib/notifications'

/**
 * GET /api/messages?property_id=xxx — Get messages for a property
 * POST /api/messages — Send a message
 */
export async function GET(request: Request) {
  try {
    await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const propertyId = url.searchParams.get('property_id')
  if (!propertyId) {
    return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const { data } = await serviceClient
    .from('messages')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: data || [] })
}

export async function POST(request: Request) {
  let user
  try {
    user = await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { property_id, body, sender_role } = await request.json()
  if (!property_id || !body) {
    return NextResponse.json({ error: 'property_id and body required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const { data, error } = await serviceClient
    .from('messages')
    .insert({
      property_id,
      sender_id: user.id,
      sender_role: sender_role || (user.app_metadata?.role === 'admin' ? 'admin' : 'owner'),
      body: body.trim(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Mark other side's messages as read
  await serviceClient
    .from('messages')
    .update({ is_read: true })
    .eq('property_id', property_id)
    .neq('sender_role', sender_role || 'admin')
    .eq('is_read', false)

  // Send email notification to the other side (fire-and-forget)
  notifyMessageRecipient(serviceClient, property_id, sender_role || 'admin', body.trim()).catch(() => {})

  return NextResponse.json({ message: data })
}

/** Send email notification to the message recipient */
async function notifyMessageRecipient(
  serviceClient: ReturnType<typeof createServiceClient>,
  propertyId: string,
  senderRole: string,
  messageBody: string,
) {
  // Get property name
  const { data: property } = await serviceClient
    .from('properties')
    .select('name, owner_id')
    .eq('id', propertyId)
    .single()

  if (!property) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://apartmentos.app'

  if (senderRole === 'owner') {
    // Owner sent → notify admin (in-app + email)
    await notifyAdmins({
      title: `New message — ${property.name}`,
      body: messageBody.slice(0, 100),
      link: '/messages',
    })

    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail) return

    await sendEmail({
      to: adminEmail,
      subject: `New message from owner — ${property.name}`,
      html: `
        <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
          <h2 style="color: #1E3A5F; margin: 0 0 8px;">New Message</h2>
          <p style="color: #6B7280; font-size: 14px; margin: 0 0 4px;">Property: <strong>${property.name}</strong></p>
          <div style="background: #F3F4F6; border-radius: 8px; padding: 12px 16px; margin: 12px 0;">
            <p style="color: #111827; font-size: 14px; margin: 0;">${messageBody}</p>
          </div>
          <a href="${appUrl}/messages" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; margin-top: 8px;">Reply in ApartmentOS</a>
          <p style="color: #9CA3AF; font-size: 11px; margin-top: 24px;">— ApartmentOS</p>
        </div>
      `,
    })
  } else {
    // Admin sent → notify owner (in-app + email)
    if (!property.owner_id) return

    const { data: owner } = await serviceClient
      .from('owners')
      .select('email, full_name, auth_user_id')
      .eq('id', property.owner_id)
      .single()

    if (!owner) return

    // In-app notification for owner
    if (owner.auth_user_id) {
      await createNotification({
        userId: owner.auth_user_id,
        title: `Message from your property manager`,
        body: messageBody.slice(0, 100),
        link: '/owner',
      })
    }

    if (!owner.email) return

    await sendEmail({
      to: owner.email,
      subject: `Message from Marcus Properties — ${property.name}`,
      html: `
        <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
          <h2 style="color: #1E3A5F; margin: 0 0 8px;">New Message</h2>
          <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px;">Hi ${owner.full_name},</p>
          <p style="color: #6B7280; font-size: 14px; margin: 0 0 4px;">You have a new message about <strong>${property.name}</strong>:</p>
          <div style="background: #F3F4F6; border-radius: 8px; padding: 12px 16px; margin: 12px 0;">
            <p style="color: #111827; font-size: 14px; margin: 0;">${messageBody}</p>
          </div>
          <a href="${appUrl}/login" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; margin-top: 8px;">View in Portal</a>
          <p style="color: #9CA3AF; font-size: 11px; margin-top: 24px;">— Marcus Properties via ApartmentOS</p>
        </div>
      `,
    })
  }
}
