import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { isAdminUser, IMPERSONATE_COWNER_COOKIE } from '@/lib/impersonation'

/**
 * POST /api/impersonate/enter
 * Body: { owner_id: string }
 *
 * Sets the impersonation cookie so the admin can view the owner portal as
 * that owner. Admin role is verified server-side. The cookie is httpOnly
 * (so client JS can't tamper with it) and secure in production.
 */
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { owner_id?: string }
  const ownerId = body.owner_id?.trim()
  if (!ownerId) {
    return NextResponse.json({ error: 'owner_id required' }, { status: 400 })
  }

  // Verify the target owner actually exists.
  const serviceClient = createServiceClient()
  const { data: target, error } = await serviceClient
    .from('owners')
    .select('id, full_name')
    .eq('id', ownerId)
    .maybeSingle()

  if (error || !target) {
    return NextResponse.json({ error: 'Owner not found' }, { status: 404 })
  }

  cookies().set(IMPERSONATE_COWNER_COOKIE, target.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // Short-lived: an admin-impersonation session shouldn't persist forever.
    maxAge: 60 * 60 * 4, // 4 hours
  })

  return NextResponse.json({
    success: true,
    owner_id: target.id,
    owner_name: target.full_name,
  })
}
