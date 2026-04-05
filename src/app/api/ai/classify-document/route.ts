import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { callGeminiJSON } from '@/lib/ai'

/**
 * POST /api/ai/classify-document
 * Classifies an uploaded document and extracts expiry date.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { storage_path, filename } = await request.json()
  if (!storage_path) {
    return NextResponse.json({ error: 'storage_path required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Download the file from Supabase storage
  const { data: fileData, error: dlError } = await serviceClient.storage
    .from('documents')
    .download(storage_path)

  if (dlError || !fileData) {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())

  // Max 10MB for AI classification
  if (buffer.byteLength > 10 * 1024 * 1024) {
    return NextResponse.json({ category: 'other', expiry_date: null, title_suggestion: filename || 'Document' })
  }

  const base64 = buffer.toString('base64')
  const mimeType = filename?.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'

  const result = await callGeminiJSON<{
    category: string
    expiry_date: string | null
    title_suggestion: string
  }>('lite', [
    {
      parts: [
        {
          text: `Classify this document. Return JSON with:
- category: one of "tabu", "insurance", "contract", "warranty", "receipt", "other"
- expiry_date: expiration date in YYYY-MM-DD format, or null if none
- title_suggestion: a short descriptive title for this document

Return ONLY valid JSON.`,
        },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64,
          },
        },
      ],
    },
  ])

  if (!result) {
    return NextResponse.json({ category: 'other', expiry_date: null, title_suggestion: filename || 'Document' })
  }

  const validCategories = ['tabu', 'insurance', 'contract', 'warranty', 'receipt', 'other']
  const category = validCategories.includes(result.category) ? result.category : 'other'

  return NextResponse.json({
    category,
    expiry_date: result.expiry_date || null,
    title_suggestion: result.title_suggestion || filename || 'Document',
  })
}
