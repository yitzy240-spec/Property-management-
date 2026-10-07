import { AgentError, json, withAgent } from '@/lib/agent-api/core'

export const dynamic = 'force-dynamic'

/** GET /api/agent/v1/contractors — cleaners etc., to resolve names to contractor_id. ?include_inactive=true */
export const GET = withAgent('tasks:read', async (request, { db }) => {
  const includeInactive = new URL(request.url).searchParams.get('include_inactive') === 'true'
  let q = db.from('contractors').select('id, name, phone, email, specialty, is_active').order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw new AgentError(500, error.message)
  return json({ contractors: data ?? [] })
})
