import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/** GET /api/properties/list — simple list for pickers */
export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const { data } = await serviceClient
    .from('properties')
    .select('id, name, lodgify_property_id')
    .eq('is_active', true)
    .order('name')

  return NextResponse.json({ properties: data || [] })
}
