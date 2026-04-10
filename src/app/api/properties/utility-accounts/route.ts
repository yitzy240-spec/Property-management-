import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const propertyId = url.searchParams.get('property_id')
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })

  const serviceClient = createServiceClient()
  const { data } = await serviceClient
    .from('property_utility_accounts')
    .select('*')
    .eq('property_id', propertyId)
    .order('utility_type')

  return NextResponse.json({ accounts: data || [] })
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const serviceClient = createServiceClient()

  const { error } = await serviceClient.from('property_utility_accounts').insert(body)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
