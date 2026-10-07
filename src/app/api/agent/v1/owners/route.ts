import { AgentError, json, withAgent } from '@/lib/agent-api/core'
import { OWNER_COLUMNS } from '@/lib/agent-api/owners'

export const dynamic = 'force-dynamic'

/** GET /api/agent/v1/owners — owners with their properties. */
export const GET = withAgent('owners:read', async (_request, { db }) => {
  const { data, error } = await db.from('owners').select(OWNER_COLUMNS).order('full_name')
  if (error) throw new AgentError(500, error.message)
  return json({ owners: data ?? [] })
})
