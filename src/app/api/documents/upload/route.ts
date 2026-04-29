import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { buildStorageKey } from '@/lib/storage'
import { assertNotImpersonating } from '@/lib/impersonation'

/**
 * POST /api/documents/upload
 * Upload a document to the vault. Accessible by admins and owners (for their own properties).
 */
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // While the admin is impersonating an owner, all owner-side mutations
  // are blocked. Real owners (no cookie) and real admins pass through.
  try {
    assertNotImpersonating(cookies())
  } catch (err) {
    if (err instanceof Error && (err as Error & { status?: number }).status === 403) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    throw err
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const title = formData.get('title') as string
  const category = (formData.get('category') as string) || 'other'
  const propertyId = formData.get('property_id') as string || null
  const expiryDate = formData.get('expiry_date') as string || null

  if (!file || !title) {
    return NextResponse.json({ error: 'file and title required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const role = user.app_metadata?.role

  // If not admin, verify the user owns this property
  if (role !== 'admin' && propertyId) {
    const { data: owner } = await serviceClient
      .from('owners')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!owner) {
      return NextResponse.json({ error: 'Owner not found' }, { status: 403 })
    }

    const { data: property } = await serviceClient
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .eq('owner_id', owner.id)
      .single()

    if (!property) {
      return NextResponse.json({ error: 'Property not found or not owned by you' }, { status: 403 })
    }
  }

  // Build a safe ASCII storage key (Supabase Storage rejects non-ASCII keys —
  // file.name may contain Hebrew chars or spaces). The original filename is
  // persisted on the documents row so downloads can preserve the human name.
  const filePath = buildStorageKey('vault', file.name)

  // Upload to storage
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await serviceClient.storage
    .from('documents')
    .upload(filePath, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Create document record in DB
  if (propertyId) {
    await serviceClient.from('documents').insert({
      property_id: propertyId,
      title,
      category,
      storage_path: filePath,
      original_filename: file.name,
      expiry_date: expiryDate || null,
    })
  }

  return NextResponse.json({
    success: true,
    storagePath: filePath,
    fileSize: file.size,
    filename: file.name,
  })
}
