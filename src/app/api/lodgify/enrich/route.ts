import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchPropertyDetail } from '@/lib/lodgify'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/lodgify/enrich
 * Pull property details from Lodgify and update local records.
 * Body: { property_id: "uuid" } or {} for all linked properties.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const serviceClient = createServiceClient()

  // Get properties to enrich
  let query = serviceClient
    .from('properties')
    .select('id, lodgify_property_id')
    .not('lodgify_property_id', 'is', null)
    .eq('is_active', true)

  if (body.property_id) {
    query = query.eq('id', body.property_id)
  }

  const { data: properties } = await query

  if (!properties || properties.length === 0) {
    return NextResponse.json({ message: 'No linked properties to enrich', enriched: 0 })
  }

  let enriched = 0
  const errors: string[] = []

  for (const prop of properties) {
    try {
      const detail = await fetchPropertyDetail(parseInt(prop.lodgify_property_id))

      // Build update with Lodgify data (only overwrite fields that are empty locally)
      const updates: Record<string, unknown> = {}

      if (detail.address) updates.address = detail.address
      if (detail.city) updates.city = detail.city

      // Store Lodgify metadata as JSON for rich display
      updates.lodgify_data = {
        description: detail.description,
        image_url: detail.image_url,
        latitude: detail.latitude,
        longitude: detail.longitude,
        currency_code: detail.currency_code,
        rooms: detail.rooms,
        updated_from_lodgify_at: new Date().toISOString(),
      }

      await serviceClient
        .from('properties')
        .update(updates)
        .eq('id', prop.id)

      enriched++
    } catch (err) {
      errors.push(`Property ${prop.id}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  return NextResponse.json({
    message: `Enriched ${enriched}/${properties.length} properties`,
    enriched,
    errors,
  })
}
