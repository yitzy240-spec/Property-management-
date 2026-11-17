import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { isWithinVisitEditWindow } from '@/lib/visits'

export const dynamic = 'force-dynamic'

/**
 * POST /api/visits/:id/media
 * 
 * Add a photo or video to a visit.
 * Only allowed within 24 hours of visit created_at.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  // Check if visit exists and is editable (within 24h)
  const { data: visit, error: fetchError } = await serviceClient
    .from('visits')
    .select('id, created_at, property_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !visit) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  }

  if (!isWithinVisitEditWindow(visit.created_at)) {
    return NextResponse.json({ 
      error: 'Media can only be added within 24 hours of visit creation' 
    }, { status: 403 })
  }

  // Parse form data
  const formData = await request.formData()
  const file = formData.get('file')
  const isPrivate = formData.get('is_private') === 'true'

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing or empty file' }, { status: 400 })
  }

  // Determine file type
  const fileType = file.type.startsWith('video/') ? 'video' : 'image'
  
  // Upload to storage
  const ext = file.name.split('.').pop() || (fileType === 'video' ? 'mp4' : 'jpg')
  const key = `${visit.property_id}/${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await serviceClient.storage
    .from('visit-media')
    .upload(key, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ 
      error: `Upload failed: ${uploadError.message}` 
    }, { status: 500 })
  }

  // Create visit_media record
  const { data: media, error: insertError } = await serviceClient
    .from('visit_media')
    .insert({
      visit_id: params.id,
      file_path: key,
      file_type: fileType,
      is_private: isPrivate,
    })
    .select('id')
    .single()

  if (insertError) {
    // Cleanup uploaded file on DB error
    await serviceClient.storage.from('visit-media').remove([key]).catch(() => {})
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  revalidatePath('/visits')
  return NextResponse.json({ success: true, mediaId: media.id })
}

/**
 * DELETE /api/visits/:id/media?mediaId=...
 * 
 * Delete a media file from a visit.
 * Only allowed within 24 hours of visit created_at.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const url = new URL(request.url)
  const mediaId = url.searchParams.get('mediaId')

  if (!mediaId) {
    return NextResponse.json({ error: 'mediaId required' }, { status: 400 })
  }

  // Check if visit exists and is editable (within 24h)
  const { data: visit, error: fetchError } = await serviceClient
    .from('visits')
    .select('id, created_at')
    .eq('id', params.id)
    .single()

  if (fetchError || !visit) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  }

  if (!isWithinVisitEditWindow(visit.created_at)) {
    return NextResponse.json({ 
      error: 'Media can only be deleted within 24 hours of visit creation' 
    }, { status: 403 })
  }

  // Get media record
  const { data: media, error: mediaError } = await serviceClient
    .from('visit_media')
    .select('id, file_path, visit_id')
    .eq('id', mediaId)
    .eq('visit_id', params.id)
    .single()

  if (mediaError || !media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  // Delete from storage
  await serviceClient.storage
    .from('visit-media')
    .remove([media.file_path])
    .catch(() => {}) // Ignore storage errors if file doesn't exist

  // Delete DB record
  const { error: deleteError } = await serviceClient
    .from('visit_media')
    .delete()
    .eq('id', mediaId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  revalidatePath('/visits')
  return NextResponse.json({ success: true })
}
