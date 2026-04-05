import { NextResponse } from 'next/server'
import { getApiKey, fetchLodgifyProperties } from '@/lib/lodgify'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * GET /api/lodgify/properties
 * Fetches the list of properties from Lodgify so admin can map them.
 */
export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const apiKey = getApiKey()
    const properties = await fetchLodgifyProperties(apiKey)
    return NextResponse.json({ properties })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch Lodgify properties' },
      { status: 500 }
    )
  }
}
