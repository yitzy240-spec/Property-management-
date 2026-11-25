import { AgentError, json, readJson, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { VISIT_COLUMNS, VisitPatch, generateMediaSignedUrls, serializeVisit } from '@/lib/agent-api/visits'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { id: string }

/**
 * GET /api/agent/v1/visits/{id} — fetch visit with media (includes signed URLs)
 */
export const GET = withAgent<Params>('visits:read', async (_request, { db }, { id }) => {
  const { data, error } = await db.from('visits').select(VISIT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Visit not found.')
  
  // Load media with signed URLs
  const { data: media } = await db
    .from('visit_media')
    .select('id, file_path, file_type, is_private, created_at')
    .eq('visit_id', id)
    .order('created_at')
  
  const serviceClient = createServiceClient()
  const mediaWithUrls = await generateMediaSignedUrls(serviceClient, media ?? [])
  
  return json({ visit: serializeVisit(data as unknown as Record<string, unknown>, mediaWithUrls) })
})

/**
 * PATCH /api/agent/v1/visits/{id} — update visit fields
 * 
 * Body: any of {visited_at, checklist, note, admin_note}
 */
export const PATCH = withAgent<Params>('visits:write', async (request, { db, audit }, { id }) => {
  const patch = VisitPatch.parse(await readJson(request))
  if (Object.keys(patch).length === 0) throw new AgentError(400, 'No fields to update.')
  
  // Load before state
  const { data: before } = await db.from('visits').select(VISIT_COLUMNS).eq('id', id).single()
  if (!before) throw new AgentError(404, 'Visit not found.')
  
  const { error } = await db.from('visits').update(patch).eq('id', id)
  if (error) throw new AgentError(400, error.message)
  
  const { data: after } = await db.from('visits').select(VISIT_COLUMNS).eq('id', id).single()
  
  await audit({ 
    resource: 'visit', 
    resourceId: id, 
    action: 'update', 
    before: serializeVisit(before as unknown as Record<string, unknown>), 
    after: serializeVisit(after as unknown as Record<string, unknown>) 
  })
  
  const propertyId = (after as { property_id?: string })?.property_id
  if (propertyId) {
    refreshAdminPages('/visits', `/properties/${propertyId}`)
  } else {
    refreshAdminPages('/visits')
  }
  
  return json({ visit: serializeVisit(after as unknown as Record<string, unknown>) })
})

/**
 * DELETE /api/agent/v1/visits/{id} — delete visit, its media records, and storage objects
 */
export const DELETE = withAgent<Params>('visits:write', async (_request, { db, audit }, { id }) => {
  const serviceClient = createServiceClient()
  
  // Load visit with media
  const { data: visit } = await db.from('visits').select(VISIT_COLUMNS).eq('id', id).single()
  if (!visit) throw new AgentError(404, 'Visit not found.')
  
  const { data: media } = await db
    .from('visit_media')
    .select('id, file_path, file_type, is_private')
    .eq('visit_id', id)
  
  const before = serializeVisit(visit as unknown as Record<string, unknown>, media ?? [])
  
  // Delete storage objects first (before deleting DB rows)
  if (media && media.length > 0) {
    const paths = media.map(m => m.file_path)
    // Remove storage objects - ignores missing files gracefully
    await serviceClient.storage.from('visit-media').remove(paths).catch((err: unknown) => {
      // Log but continue - missing storage objects shouldn't block deletion
      console.warn('Visit media storage cleanup warning:', err)
    })
  }
  
  // Delete visit (cascade deletes visit_media rows)
  const { error } = await db.from('visits').delete().eq('id', id)
  if (error) throw new AgentError(400, error.message)
  
  await audit({ resource: 'visit', resourceId: id, action: 'delete', before, after: null })
  
  const propertyId = (visit as { property_id?: string })?.property_id
  if (propertyId) {
    refreshAdminPages('/visits', `/properties/${propertyId}`)
  } else {
    refreshAdminPages('/visits')
  }
  
  return json({ success: true })
})
