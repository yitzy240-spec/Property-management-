import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { testGeminiKey } from '@/lib/gemini'

/**
 * POST /api/settings/test
 * Tests an API key by pinging the respective service.
 * Body: { key: 'ai_api_key', value: 'the-key-to-test' }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { key, value } = await request.json()
  if (!key || !value) {
    return NextResponse.json({ error: 'Key and value required' }, { status: 400 })
  }

  try {
    switch (key) {
      case 'ai_api_key': {
        const result = await testGeminiKey(value)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ success: false, message: 'No test available for this key' })
    }
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    })
  }
}
