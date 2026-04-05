import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchRatesCalendar, fetchPropertyDetail } from '@/lib/lodgify'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * GET /api/lodgify/rates?property_id=uuid&start=2026-04-01&end=2026-04-30
 * Returns daily rates from Lodgify for a property.
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

  const serviceClient = createServiceClient()
  const { data: property } = await serviceClient
    .from('properties')
    .select('lodgify_property_id')
    .eq('id', propertyId)
    .single()

  if (!property?.lodgify_property_id) {
    return NextResponse.json({ error: 'Property not linked to Lodgify' }, { status: 404 })
  }

  const lodgifyId = parseInt(property.lodgify_property_id)

  try {
    // Get the first room type ID for this property
    const propertyDetail = await fetchPropertyDetail(lodgifyId)
    const roomTypeId = propertyDetail.rooms?.[0]?.id

    if (!roomTypeId) {
      return NextResponse.json({ error: 'No room types found for property' }, { status: 404 })
    }

    const rates = await fetchRatesCalendar(lodgifyId, roomTypeId, start, end)
    return NextResponse.json({ rates, currency: propertyDetail.currency_code })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch rates' },
      { status: 500 }
    )
  }
}
