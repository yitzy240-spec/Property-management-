import { NextResponse } from 'next/server'
import { fetchAllDocuments } from '@/lib/green-invoice'
import { requireAuth, AuthError } from '@/lib/auth'

/**
 * GET /api/green-invoice/invoices
 * Pull full invoice history from Green Invoice (all pages).
 * Accessible to both admins and owners.
 */
export async function GET() {
  try {
    await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const items = await fetchAllDocuments()
    return NextResponse.json({ items, total: items.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch invoices' },
      { status: 500 }
    )
  }
}
