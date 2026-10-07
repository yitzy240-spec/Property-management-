import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { IMPERSONATE_OWNER_COOKIE, getEffectiveOwnerId, isAdminUser } from '@/lib/impersonation'

/**
 * GET /api/statements?month=2026-04-01&owner_id=xxx
 *
 * Admin sees everything. Owners see only sent/approved statements (no
 * drafts or pending_approval). When admin is impersonating an owner, we
 * apply the owner-level filter — otherwise the View-as-Owner view leaks
 * drafts that real owners would never see.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const ownerId = searchParams.get('owner_id')

  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Admin view = admin role AND not viewing-as-owner. Everyone else (owners,
  // impersonating admins) is pinned to ONE owner resolved server-side —
  // getEffectiveOwnerId ignores the impersonation cookie for non-admins, so
  // an owner can't set it to read other owners' statements.
  const cookieStore = cookies()
  const adminView = isAdminUser(user) && !cookieStore.get(IMPERSONATE_OWNER_COOKIE)?.value

  let query = serviceClient
    .from('monthly_statements')
    .select('*, owners(full_name, email)')
    .order('billing_month', { ascending: false })

  if (adminView) {
    if (ownerId) query = query.eq('owner_id', ownerId)
  } else {
    const { ownerId: effectiveOwnerId } = await getEffectiveOwnerId(supabase, serviceClient, cookieStore)
    if (!effectiveOwnerId) return NextResponse.json({ statements: [] })
    // Owner-side view never sees drafts or statements awaiting approval.
    query = query
      .eq('owner_id', effectiveOwnerId)
      .not('status', 'in', '("draft","pending_approval")')
  }

  if (month) query = query.eq('billing_month', month)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ statements: data ?? [] })
}
