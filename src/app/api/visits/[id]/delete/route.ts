import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/visits/:id/delete
 * 
 * Delete a visit, its media records, and storage objects (admin only).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await requireAdmin()
  
  const serviceClient = createServiceClient()
  
  // Fetch visit and media
  const { data: visit, error: visitError } = await serviceClient
    .from('visits')
    .select('*, visit_media(*)')
    .eq('id', params.id)
    .single()
  
  if (visitError || !visit) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  }
  
  // Delete storage objects first (before deleting DB rows)
  const media = visit.visit_media as Array<{ file_path: string }> | null
  if (media && media.length > 0) {
    const paths = media.map((m: { file_path: string }) => m.file_path)
    // Remove storage objects - ignores missing files gracefully
    await serviceClient.storage
      .from('visit-media')
      .remove(paths)
      .catch((err: unknown) => {
        // Log but continue - missing storage objects shouldn't block deletion
        console.warn('Visit media storage cleanup warning:', err)
      })
  }
  
  // Delete visit (cascades to visit_media table)
  const { error: deleteError } = await serviceClient
    .from('visits')
    .delete()
    .eq('id', params.id)
  
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }
  
  // Revalidate relevant pages
  revalidatePath('/visits')
  if (visit.property_id) {
    revalidatePath(`/properties/${visit.property_id}`)
  }
  
  return NextResponse.json({ success: true })
}
