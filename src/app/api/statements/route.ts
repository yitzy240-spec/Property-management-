import { NextResponse } from 'next/server'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/statements?month=2026-04-01&owner_id=xxx
 * List statements — admin sees all, owners see their own
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

  // Admin uses service client (bypasses RLS), owners use regular client
  const client = isAdmin ? createServiceClient() : supabase

  let query = client
    .from('monthly_statements')
    .select('*, owners(full_name, email)')
    .order('billing_month', { ascending: false })

  // Owners should not see draft or pending_approval statements
  if (!isAdmin) {
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
