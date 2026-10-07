import { AgentError, json, withAgent } from '@/lib/agent-api/core'
import { PROPERTY_COLUMNS, serializeProperty } from '@/lib/agent-api/properties'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = withAgent<Params>('properties:read', async (_request, { db }, { id }) => {
  const { data, error } = await db.from('properties').select(PROPERTY_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Property not found.')
  return json({ property: serializeProperty(data as unknown as Record<string, unknown>) })
})
