import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { ownerId, authUserId } = await request.json()
  if (!ownerId) return NextResponse.json({ error: 'ownerId required' }, { status: 400 })

  const serviceClient = createServiceClient()

  // Unlink properties (set owner_id to null)
  await serviceClient
    .from('properties')
    .update({ owner_id: null })
    .eq('owner_id', ownerId)

  // Delete the owner record
  const { error } = await serviceClient
    .from('owners')
    .delete()
    .eq('id', ownerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Delete auth user if exists
  if (authUserId) {
    await serviceClient.auth.admin.deleteUser(authUserId).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
