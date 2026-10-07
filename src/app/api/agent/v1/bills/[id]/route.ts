import { AgentError, json, readJson, refreshAdminPages, toMinor, withAgent } from '@/lib/agent-api/core'
import { BillPatch, loadBill } from '@/lib/agent-api/utilities'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = withAgent<Params>('bills:read', async (_request, { db }, { id }) => {
  return json({ bill: await loadBill(db, id) })
})

/** PATCH /api/agent/v1/bills/:id — fix amount/dates/type/property. Approved bills are locked. */
export const PATCH = withAgent<Params>('bills:write', async (request, { db, audit }, { id }) => {
  const patch = BillPatch.parse(await readJson(request))
  if (Object.keys(patch).length === 0) throw new AgentError(400, 'No fields to update.')
  const before = structuredClone(await loadBill(db, id))
  if (before.status === 'approved') {
    throw new AgentError(409, 'This bill is already approved (it may be on an owner statement). Ask the admin to change it.')
  }

  const { amount_ils, ...rest } = patch
  const row: Record<string, unknown> = { ...rest }
  if (amount_ils !== undefined) row.amount_agorot = toMinor(amount_ils)
  const { error } = await db.from('bills').update(row).eq('id', id)
  if (error) throw new AgentError(400, error.message)

  const bill = await loadBill(db, id)
  await audit({ resource: 'bill', resourceId: id, action: 'update', before, after: bill })
  refreshAdminPages('/bills', `/properties/${bill.property_id}`)
  return json({ bill })
})
