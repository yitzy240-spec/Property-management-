import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/properties/image — Upload property hero image
 * Body: FormData with `file` and `propertyId`
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const propertyId = formData.get('propertyId') as string

  if (!file || !propertyId) {
    return NextResponse.json({ error: 'file and propertyId required' }, { status: 400 })
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const storagePath = `${propertyId}/hero.${ext}`

  // Delete old image if exists (any extension)
  const { data: existingFiles } = await serviceClient.storage
    .from('property-images')
    .list(propertyId)

  if (existingFiles?.length) {
    await serviceClient.storage
      .from('property-images')
      .remove(existingFiles.map(f => `${propertyId}/${f.name}`))
  }

  // Upload new image
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await serviceClient.storage
    .from('property-images')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Get public URL
  const { data: urlData } = serviceClient.storage
    .from('property-images')
    .getPublicUrl(storagePath)

  const imageUrl = urlData.publicUrl

  // Update property record
  const { error: updateError } = await serviceClient
    .from('properties')
    .update({ image_url: imageUrl })
    .eq('id', propertyId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ imageUrl })
}

/**
 * DELETE /api/properties/image — Remove property image
 * Body: { propertyId }
 */
export async function DELETE(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { propertyId } = await request.json()
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Delete files from storage
  const { data: existingFiles } = await serviceClient.storage
    .from('property-images')
    .list(propertyId)

  if (existingFiles?.length) {
    await serviceClient.storage
      .from('property-images')
      .remove(existingFiles.map(f => `${propertyId}/${f.name}`))
  }

  // Clear image_url on property
  await serviceClient
    .from('properties')
    .update({ image_url: null })
    .eq('id', propertyId)

  return NextResponse.json({ success: true })
}
