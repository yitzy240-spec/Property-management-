import { NextResponse } from 'next/server'
import { getDocumentDownloadLinks } from '@/lib/green-invoice'
import { requireAuth, AuthError } from '@/lib/auth'

/**
 * GET /api/green-invoice/invoices/[id]/download?lang=he
 * Get PDF download link for a Green Invoice document.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const lang = (url.searchParams.get('lang') || 'he') as 'he' | 'en'

  try {
    const links = await getDocumentDownloadLinks(params.id)
    const downloadUrl = lang === 'en' ? links.en : links.he

    return NextResponse.redirect(downloadUrl)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get download link' },
      { status: 500 }
    )
  }
}
