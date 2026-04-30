import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { IMPERSONATE_OWNER_COOKIE } from '@/lib/impersonation'

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
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = user.app_metadata?.role === 'admin' || user.email === process.env.ADMIN_EMAIL
  const isImpersonating = !!cookies().get(IMPERSONATE_OWNER_COOKIE)?.value

  // Treat impersonating admins as owners for visibility — they should see
  // exactly what the impersonated owner sees, including the draft hide.
  const treatAsOwner = !isAdmin || isImpersonating

  // Admin (not impersonating) uses service client to bypass RLS. Owners and
  // impersonating admins go through the regular client / service client with
  // explicit owner_id scoping (RLS for the real owner, owner_id filter for
  // the impersonating admin).
  const client = !treatAsOwner ? createServiceClient() :
                 isImpersonating ? createServiceClient() :
                 supabase

  let query = client
    .from('monthly_statements')
    .select('*, owners(full_name, email)')
    .order('billing_month', { ascending: false })

  // Hide draft and pending_approval from anyone seeing the owner-side view.
  if (treatAsOwner) {
    query = query.not('status', 'in', '("draft","pending_approval")')
  }

  if (month) query = query.eq('billing_month', month)
  if (ownerId) query = query.eq('owner_id', ownerId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ statements: data ?? [] })
}
