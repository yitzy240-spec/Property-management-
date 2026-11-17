import { AgentError, json, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { loadBill } from '@/lib/agent-api/utilities'

export const dynamic = 'force-dynamic'

type Params = { id: string }

/**
 * POST /api/agent/v1/bills/:id/reject — reject a bill.
 * 
 * Sets status='rejected'. Rejected bills are hidden from owners and excluded
 * from totals/summaries, but kept in the DB to prevent re-ingestion.
 */
export const POST = withAgent<Params>('bills:write', async (_request, { db, audit }, { id }) => {
  const before = await loadBill(db, id)
  
  if (before.status === 'rejected') {
    throw new AgentError(409, 'Bill is already rejected.')
  }
  
  const { error } = await db
    .from('bills')
    .update({
      status: 'rejected',
      approved_at: null,
    })
    .eq('id', id)
  
  if (error) throw new AgentError(400, error.message)
  
  const bill = await loadBill(db, id)
  await audit({ resource: 'bill', resourceId: id, action: 'reject', before, after: bill })
  refreshAdminPages('/bills', `/properties/${bill.property_id}`)
  return json({ bill })
})
