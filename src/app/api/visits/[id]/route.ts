import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, isAdmin } from '@/lib/auth'

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
  
  // Fetch media (RLS will filter for owners)
  const { data: media, error: mediaError } = await client
    .from('visit_media')
    .select('*')
    .eq('visit_id', params.id)
    .order('created_at')
  
  if (mediaError) {
    return NextResponse.json({ error: mediaError.message }, { status: 500 })
  }
  
  // Generate signed URLs for media
  const mediaWithUrls = await Promise.all(
    (media ?? []).map(async (m) => {
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
  
  // Check if editable (admin only, within 24h)
  const createdAt = new Date(visit.created_at)
  const now = new Date()
  const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
  const canEdit = userIsAdmin && hoursSinceCreation < 24
  
  // Remove admin_note for owners
  const responseVisit = {
    id: visit.id,
    property_id: visit.property_id,
    visited_at: visit.visited_at,
    checklist: visit.checklist,
    note: visit.note,
    admin_note: userIsAdmin ? visit.admin_note : null,
    created_by: visit.created_by,
    created_at: visit.created_at,
    properties: visit.properties,
    media: mediaWithUrls,
    can_edit: canEdit,
  }
  
  return NextResponse.json({ visit: responseVisit })
}
