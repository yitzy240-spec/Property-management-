import { AgentError, json, paging, readJson, refreshAdminPages, toMinor, withAgent } from '@/lib/agent-api/core'
import { BILL_COLUMNS, BillCreate, loadBill, serializeBill } from '@/lib/agent-api/utilities'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agent/v1/bills — ?property_id= &bill_type= &status=pending_review,approved
 *   &from=YYYY-MM-DD &to=YYYY-MM-DD (due date) &limit= &offset=
 */
export const GET = withAgent('bills:read', async (request, { db }) => {
  const url = new URL(request.url)
  const p = url.searchParams
  const { limit, offset } = paging(url)
  let q = db
    .from('bills')
    .select(BILL_COLUMNS)
    .order('due_date', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (p.get('property_id')) q = q.eq('property_id', p.get('property_id')!)
  if (p.get('bill_type')) q = q.eq('bill_type', p.get('bill_type')!)
  if (p.get('status')) q = q.in('status', p.get('status')!.split(',').map(s => s.trim()))
  if (p.get('from')) q = q.gte('due_date', p.get('from')!)
  if (p.get('to')) q = q.lte('due_date', p.get('to')!)
  const { data, error } = await q
  if (error) throw new AgentError(500, error.message)
  return json({ bills: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(serializeBill), limit, offset })
})

/**
 * POST /api/agent/v1/bills — add a bill (amount in ₪). It lands in the admin's
 * review queue as pending_review; approval and payment method stay with the
 * admin because they feed owner statements.
 */
export const POST = withAgent('bills:write', async (request, { db, audit }) => {
  const body = BillCreate.parse(await readJson(request))
  const { data, error } = await db
    .from('bills')
    .insert({
      property_id: body.property_id,
      bill_type: body.bill_type,
      amount_agorot: toMinor(body.amount_ils),
      due_date: body.due_date ?? null,
      billing_period_start: body.billing_period_start ?? null,
      billing_period_end: body.billing_period_end ?? null,
      status: 'pending_review',
    })
    .select('id')
    .single()
  if (error || !data) throw new AgentError(400, error?.message ?? 'Insert failed')
  const bill = await loadBill(db, data.id)
  await audit({ resource: 'bill', resourceId: data.id, action: 'create', after: bill })
  refreshAdminPages('/bills', `/properties/${body.property_id}`)
  return json({ bill }, 201)
})
