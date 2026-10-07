import { AgentError, json, withAgent } from '@/lib/agent-api/core'
import { PROPERTY_COLUMNS, serializeProperty } from '@/lib/agent-api/properties'

export const dynamic = 'force-dynamic'

/** GET /api/agent/v1/properties — ?include_inactive=true &owner_id= . Door codes are at /properties/:id/codes. */
export const GET = withAgent('properties:read', async (request, { db }) => {
  const p = new URL(request.url).searchParams
  let q = db.from('properties').select(PROPERTY_COLUMNS).order('name')
  if (p.get('include_inactive') !== 'true') q = q.eq('is_active', true)
  if (p.get('owner_id')) q = q.eq('owner_id', p.get('owner_id')!)
  const { data, error } = await q
  if (error) throw new AgentError(500, error.message)
  return json({ properties: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(serializeProperty) })
})
