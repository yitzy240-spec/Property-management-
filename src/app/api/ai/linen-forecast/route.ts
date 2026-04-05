import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { callGeminiJSON } from '@/lib/ai'

/**
 * GET /api/ai/linen-forecast
 * Predicts which properties need laundry runs based on upcoming bookings.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const today = new Date().toISOString().split('T')[0]
  const twoWeeksOut = new Date()
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)
  const endStr = twoWeeksOut.toISOString().split('T')[0]

  const [
    { data: bookings },
    { data: inventory },
    { data: properties },
  ] = await Promise.all([
    serviceClient.from('bookings')
      .select('property_id, check_in, check_out, guest_name')
      .gte('check_in', today)
      .lte('check_in', endStr)
      .order('check_in'),
    serviceClient.from('inventory_items')
      .select('property_id, item_name, quantity_in_closet, quantity_at_laundry, par_level, properties(name)')
      .order('property_id'),
    serviceClient.from('properties')
      .select('id, name')
      .eq('is_active', true),
  ])

  const dataPayload = {
    today,
    properties: (properties ?? []).map(p => {
      const propBookings = (bookings ?? []).filter(b => b.property_id === p.id)
      const propInventory = (inventory ?? []).filter(i => i.property_id === p.id)
      return {
        name: p.name,
        upcoming_turnovers: propBookings.map(b => ({
          check_in: b.check_in,
          check_out: b.check_out,
        })),
        inventory: propInventory.map(i => ({
          item: i.item_name,
          in_closet: i.quantity_in_closet,
          at_laundry: i.quantity_at_laundry,
          par_level: i.par_level,
        })),
      }
    }),
  }

  const forecast = await callGeminiJSON<Array<{
    property_name: string
    urgency: 'ok' | 'soon' | 'urgent'
    recommended_laundry_date: string
    reason: string
  }>>('fast', [{
    parts: [{
      text: `Analyze linen inventory and upcoming bookings for these Jerusalem short-term rental properties. For each property, determine if a laundry run is needed in the next 7 days.

Data:
${JSON.stringify(dataPayload, null, 2)}

Rules:
- Each turnover needs 1 full set of linens per bedroom
- Par level is the minimum safe stock. Below par = urgent
- Factor in laundry turnaround time of 2 days

Return a JSON array of objects for properties that need attention:
{ property_name, urgency ("ok"|"soon"|"urgent"), recommended_laundry_date (YYYY-MM-DD), reason (1 sentence) }

Only include properties that need action (urgency "soon" or "urgent"). Return empty array if all properties are fine.`,
    }],
  }])

  return NextResponse.json({ forecasts: forecast ?? [] })
}
