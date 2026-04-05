import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { callGeminiJSON } from '@/lib/ai'

/**
 * POST /api/ai/analyze-photo
 * Analyzes a maintenance photo and suggests task details.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { image_base64, mime_type } = await request.json()
  if (!image_base64) {
    return NextResponse.json({ error: 'image_base64 required' }, { status: 400 })
  }

  const result = await callGeminiJSON<{
    title: string
    description: string
    priority: string
    checklist: string[]
  }>('pro', [
    {
      parts: [
        {
          text: `Analyze this photo of a maintenance issue in a short-term rental apartment in Jerusalem. Return JSON with:
- title: concise task title (under 60 chars)
- description: 2-3 sentence description of the issue and recommended fix
- priority: one of "low", "normal", "high", "urgent"
- checklist: array of 2-4 actionable steps to resolve the issue

If you can identify specific parts, brands, or Israeli-standard fittings, include them. Return ONLY valid JSON.`,
        },
        {
          inline_data: {
            mime_type: mime_type || 'image/jpeg',
            data: image_base64,
          },
        },
      ],
    },
  ])

  if (!result) {
    return NextResponse.json({ title: '', description: '', priority: 'normal', checklist: [] })
  }

  const validPriorities = ['low', 'normal', 'high', 'urgent']

  return NextResponse.json({
    title: result.title || '',
    description: result.description || '',
    priority: validPriorities.includes(result.priority) ? result.priority : 'normal',
    checklist: Array.isArray(result.checklist) ? result.checklist : [],
  })
}
