import { AgentError, json, paging, readJson, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { VISIT_COLUMNS, VisitCreate, generateMediaSignedUrls, serializeVisit } from '@/lib/agent-api/visits'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agent/v1/visits — ?property_id= &from=YYYY-MM-DD &to=YYYY-MM-DD (visited_at) &limit= &offset=
 * 
 * Returns visits with media (includes signed URLs for media files).
 */
export const GET = withAgent('visits:read', async (request, { db }) => {
  const url = new URL(request.url)
  const p = url.searchParams
  const { limit, offset } = paging(url)
  const propertyId = p.get('property_id')
  const from = p.get('from')
  const to = p.get('to')
  
  let q = db
    .from('visits')
    .select(VISIT_COLUMNS)
    .order('visited_at', { ascending: false })
    .range(offset, offset + limit - 1)
  
  if (propertyId) q = q.eq('property_id', propertyId)
  if (from) q = q.gte('visited_at', from)
  if (to) q = q.lte('visited_at', to)
  
  const { data, error } = await q
  if (error) throw new AgentError(500, error.message)
  
  // For list view, we don't include media to keep response size manageable
  // Use GET /visits/{id} to fetch media with signed URLs
  const visits = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(v => serializeVisit(v))
  return json({ visits, limit, offset })
})

/**
 * POST /api/agent/v1/visits — create a visit record
 * 
 * Body: {property_id, visited_at?, checklist?, note?, admin_note?}
 */
export const POST = withAgent('visits:write', async (request, { db, audit, userId }) => {
  const body = await readJson(request)
  const parsed = VisitCreate.parse(body)
  
  const { data, error } = await db
    .from('visits')
    .insert({
      property_id: parsed.property_id,
      visited_at: parsed.visited_at ?? new Date().toISOString().split('T')[0],
      checklist: parsed.checklist ?? {},
      note: parsed.note ?? null,
      admin_note: parsed.admin_note ?? null,
      created_by: userId,
    })
    .select('id')
    .single()
  
  if (error || !data) throw new AgentError(400, error?.message ?? 'Insert failed')
  
  const serviceClient = createServiceClient()
  const { data: visit } = await serviceClient.from('visits').select(VISIT_COLUMNS).eq('id', data.id).single()
  
  const serialized = serializeVisit(visit as unknown as Record<string, unknown>)
  await audit({ resource: 'visit', resourceId: data.id, action: 'create', after: serialized })
  refreshAdminPages('/visits', `/properties/${parsed.property_id}`)
  return json({ visit: serialized }, 201)
})
