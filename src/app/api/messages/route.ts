import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAuth, AuthError } from '@/lib/auth'

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

  return NextResponse.json({ message: data })
}
