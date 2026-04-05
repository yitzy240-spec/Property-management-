import { NextResponse } from 'next/server'
import { searchDocuments, getDocumentDownloadLinks, DOC_TYPES } from '@/lib/green-invoice'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * GET /api/green-invoice/invoices?from=2026-01-01&to=2026-04-30
 * Pull invoice history from Green Invoice.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const fromDate = url.searchParams.get('from') || undefined
  const toDate = url.searchParams.get('to') || undefined

  try {
    const result = await searchDocuments({
      fromDate,
      toDate,
      type: [DOC_TYPES.TAX_INVOICE, DOC_TYPES.TAX_INVOICE_RECEIPT, DOC_TYPES.RECEIPT],
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch invoices' },
      { status: 500 }
    )
  }
}
