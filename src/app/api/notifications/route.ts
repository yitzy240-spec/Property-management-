import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/notifications — List notifications for current user
 * PATCH /api/notifications — Mark notifications as read
 */
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()
  const { data } = await serviceClient
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  const { count } = await serviceClient
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  return NextResponse.json({ notifications: data || [], unread: count || 0 })
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await request.json()
  const serviceClient = createServiceClient()

  if (ids === 'all') {
    await serviceClient
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
  } else if (Array.isArray(ids)) {
    await serviceClient
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .in('id', ids)
  }

  return NextResponse.json({ success: true })
}
