import { AgentError, json, readJson, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { UTILITY_COLUMNS, UtilityAccountCreate, loadUtility, serializeUtility } from '@/lib/agent-api/utilities'

export const dynamic = 'force-dynamic'

/** GET /api/agent/v1/utility-accounts — ?property_id= &utility_type= */
export const GET = withAgent('utilities:read', async (request, { db }) => {
  const p = new URL(request.url).searchParams
  let q = db.from('property_utility_accounts').select(UTILITY_COLUMNS).order('utility_type')
  if (p.get('property_id')) q = q.eq('property_id', p.get('property_id')!)
  if (p.get('utility_type')) q = q.eq('utility_type', p.get('utility_type')!)
  const { data, error } = await q
  if (error) throw new AgentError(500, error.message)
  return json({ utility_accounts: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(serializeUtility) })
})

/**
 * POST /api/agent/v1/utility-accounts — the account number is also what bill
 * routing matches incoming bills on, so keep it exact.
 */
export const POST = withAgent('utilities:write', async (request, { db, audit }) => {
  const body = UtilityAccountCreate.parse(await readJson(request))
  const { data, error } = await db.from('property_utility_accounts').insert(body).select('id').single()
  if (error || !data) throw new AgentError(400, error?.message ?? 'Insert failed')
  const account = await loadUtility(db, data.id)
  await audit({ resource: 'utility_account', resourceId: data.id, action: 'create', after: account })
  refreshAdminPages(`/properties/${body.property_id}`)
  return json({ utility_account: account }, 201)
})
