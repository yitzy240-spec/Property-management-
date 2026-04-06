import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAuth, AuthError } from '@/lib/auth'

/**
 * GET /api/messages/unread — Get unread message count for current user
 * Admin sees owner messages; owners see admin messages
 */
export async function GET() {
  let user
  try {
    user = await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = user.app_metadata?.role === 'admin' || user.email === process.env.ADMIN_EMAIL
  const serviceClient = createServiceClient()

  if (isAdmin) {
    // Admin: count unread messages from owners
    const { count } = await serviceClient
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('sender_role', 'owner')

    return NextResponse.json({ unread: count || 0 })
  } else {
    // Owner: count unread messages from admin on their properties
    const { data: owner } = await serviceClient
      .from('owners')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!owner) return NextResponse.json({ unread: 0 })

    const { data: properties } = await serviceClient
      .from('properties')
      .select('id')
      .eq('owner_id', owner.id)

    if (!properties?.length) return NextResponse.json({ unread: 0 })

    const propertyIds = properties.map(p => p.id)
    const { count } = await serviceClient
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('sender_role', 'admin')
      .in('property_id', propertyIds)

    return NextResponse.json({ unread: count || 0 })
  }
}
