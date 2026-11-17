import { AgentError, json, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { loadBill } from '@/lib/agent-api/utilities'

export const dynamic = 'force-dynamic'

type Params = { id: string }

/**
 * POST /api/agent/v1/bills/:id/approve — approve a bill.
 * 
 * Sets status='approved' and approved_at. Approved bills become visible to owners
 * and can be included in monthly statements.
 */
export const POST = withAgent<Params>('bills:write', async (_request, { db, audit }, { id }) => {
  const before = await loadBill(db, id)
  
  if (before.status === 'approved') {
    throw new AgentError(409, 'Bill is already approved.')
  }
  
  const { error } = await db
    .from('bills')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
  
  if (error) throw new AgentError(400, error.message)
  
  const bill = await loadBill(db, id)
  await audit({ resource: 'bill', resourceId: id, action: 'update', before, after: bill })
  refreshAdminPages('/bills', `/properties/${bill.property_id}`)
  return json({ bill })
})
