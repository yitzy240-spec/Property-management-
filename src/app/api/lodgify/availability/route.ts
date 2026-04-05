import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAvailability } from '@/lib/lodgify'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * GET /api/lodgify/availability?property_id=uuid&start=2026-04-01&end=2026-04-30
 * Returns availability periods from Lodgify for a property.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const propertyId = url.searchParams.get('property_id')
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')

  if (!propertyId || !start || !end) {
    return NextResponse.json({ error: 'property_id, start, and end required' }, { status: 400 })
  }

  // Look up lodgify_property_id
  const serviceClient = createServiceClient()
  const { data: property } = await serviceClient
    .from('properties')
    .select('lodgify_property_id')
    .eq('id', propertyId)
    .single()

  if (!property?.lodgify_property_id) {
    return NextResponse.json({ error: 'Property not linked to Lodgify' }, { status: 404 })
  }

  try {
    const availability = await fetchAvailability(
      parseInt(property.lodgify_property_id),
      start,
      end
    )
    return NextResponse.json({ availability })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch availability' },
      { status: 500 }
    )
  }
}
