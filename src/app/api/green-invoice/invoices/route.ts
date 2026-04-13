import { NextResponse } from 'next/server'
import { fetchAllDocuments } from '@/lib/green-invoice'
import { requireAuth, AuthError } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/green-invoice/invoices?client=OwnerName
 * Pull invoice history from Green Invoice.
 * Admin: sees all (or filtered by ?client=).
 * Owner: only sees their own documents (filtered by their name).
 */
export async function GET(request: Request) {
  let user
  try {
    user = await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = user.app_metadata?.role === 'admin' || user.email === process.env.ADMIN_EMAIL
  const { searchParams } = new URL(request.url)
  let clientFilter = searchParams.get('client')

  // Non-admin users can ONLY see their own documents
  if (!isAdmin) {
    const supabase = createServerSupabaseClient()
    const { data: owner } = await supabase
      .from('owners')
      .select('full_name')
      .eq('auth_user_id', user.id)
      .single()

    if (owner) {
      clientFilter = owner.full_name
    } else {
      return NextResponse.json({ items: [], total: 0 })
    }
  }

  try {
    const allItems = await fetchAllDocuments()

    // Filter server-side by client name
    const items = clientFilter
      ? allItems.filter(d =>
          d.client?.name?.toLowerCase() === clientFilter!.toLowerCase()
        )
      : allItems

    return NextResponse.json({ items, total: items.length })
  } catch {
    return NextResponse.json({ items: [], total: 0 })
  }
}
