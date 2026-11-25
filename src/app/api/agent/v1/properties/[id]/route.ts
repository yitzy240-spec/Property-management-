import { AgentError, json, readJson, refreshAdminPages, toMinor, withAgent } from '@/lib/agent-api/core'
import { PROPERTY_COLUMNS, PropertyPatch, loadProperty, serializeProperty } from '@/lib/agent-api/properties'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = withAgent<Params>('properties:read', async (_request, { db }, { id }) => {
  return json({ property: await loadProperty(db, id) })
})

/**
 * PATCH /api/agent/v1/properties/{id} — update property fields
 * 
 * Accepts the same fields as the web UI property edit form.
 */
export const PATCH = withAgent<Params>('properties:write', async (request, { db, audit }, { id }) => {
  const patch = PropertyPatch.parse(await readJson(request))
  if (Object.keys(patch).length === 0) throw new AgentError(400, 'No fields to update.')
  
  const before = structuredClone(await loadProperty(db, id))
  
  // Convert ILS to agorot for monetary fields
  const { management_fee_ils, hourly_rate_ils, ...rest } = patch
  const row: Record<string, unknown> = { ...rest }
  if (management_fee_ils !== undefined) row.management_fee_agorot = toMinor(management_fee_ils)
  if (hourly_rate_ils !== undefined) row.hourly_rate_agorot = toMinor(hourly_rate_ils)
  
  const { error } = await db.from('properties').update(row).eq('id', id)
  if (error) throw new AgentError(400, error.message)
  
  const property = await loadProperty(db, id)
  await audit({ resource: 'property', resourceId: id, action: 'update', before, after: property })
  refreshAdminPages('/properties', `/properties/${id}`)
  return json({ property })
})
