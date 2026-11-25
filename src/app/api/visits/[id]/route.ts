import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, isAdmin } from '@/lib/auth'
import { isWithinVisitEditWindow, serializeVisitForViewer } from '@/lib/visits'

export const dynamic = 'force-dynamic'

/**
 * GET /api/visits/:id
 * 
 * Fetch visit details with media and signed URLs.
 * Admins see all fields and media; owners see only public media and no admin_note.
 * Returns can_edit flag (true if admin and within 24h of created_at).
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()
  
  // Check if user is admin
  const userIsAdmin = await isAdmin().catch(() => false)
  
  // Use service client for admins, auth client for owners (RLS enforced)
  const client = userIsAdmin ? serviceClient : supabase
  
  // Fetch visit
  const { data: visit, error: visitError } = await client
    .from('visits')
    .select('*, properties(name)')
    .eq('id', params.id)
    .single()
  
  if (visitError || !visit) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  }
  
  // Fetch ALL media (we'll filter is_private in code for non-admins)
  const { data: media, error: mediaError } = await serviceClient
    .from('visit_media')
    .select('*')
    .eq('visit_id', params.id)
    .order('created_at')
  
  if (mediaError) {
    return NextResponse.json({ error: mediaError.message }, { status: 500 })
  }
  
  // Explicitly filter is_private media for non-admins (don't rely only on RLS)
  const filteredMedia = userIsAdmin ? (media ?? []) : (media ?? []).filter(m => !m.is_private)
  
  // Generate signed URLs for filtered media
  const mediaWithUrls = await Promise.all(
    filteredMedia.map(async (m) => {
      let signedUrl: string | null = null
      
      // Generate signed URL (60 minute expiry)
      const { data: urlData, error: urlError } = await serviceClient.storage
        .from('visit-media')
        .createSignedUrl(m.file_path, 3600)
      
      if (!urlError && urlData) {
        signedUrl = urlData.signedUrl
      }
      
      return {
        id: m.id,
        file_path: m.file_path,
        file_type: m.file_type,
        is_private: m.is_private,
        signed_url: signedUrl,
      }
    })
  )
  
  // Admin can always edit; non-admin creators can edit within 24h
  const canEdit = userIsAdmin || isWithinVisitEditWindow(visit.created_at)
  
  // Serialize visit for viewer (strips admin_note for non-admins)
  const serialized = serializeVisitForViewer(visit, mediaWithUrls, userIsAdmin)
  
  const responseVisit = {
    ...serialized,
    can_edit: canEdit,
  }
  
  return NextResponse.json({ visit: responseVisit })
}
