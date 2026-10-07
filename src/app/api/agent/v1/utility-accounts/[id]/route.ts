import { AgentError, json, readJson, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { UtilityAccountPatch, loadUtility } from '@/lib/agent-api/utilities'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = withAgent<Params>('utilities:read', async (_request, { db }, { id }) => {
  return json({ utility_account: await loadUtility(db, id) })
})

export const PATCH = withAgent<Params>('utilities:write', async (request, { db, audit }, { id }) => {
  const patch = UtilityAccountPatch.parse(await readJson(request))
  if (Object.keys(patch).length === 0) throw new AgentError(400, 'No fields to update.')
  const before = structuredClone(await loadUtility(db, id))
  const { error } = await db.from('property_utility_accounts').update(patch).eq('id', id)
  if (error) throw new AgentError(400, error.message)
  const account = await loadUtility(db, id)
  await audit({ resource: 'utility_account', resourceId: id, action: 'update', before, after: account })
  refreshAdminPages(`/properties/${account.property_id}`)
  return json({ utility_account: account })
})
