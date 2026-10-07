import { CLEANING_CHECKLIST } from '@/lib/cleaning-checklist'
import { AgentError, json, paging, readJson, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { TASK_COLUMNS, TaskCreate, loadTask, serializeTask } from '@/lib/agent-api/tasks'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agent/v1/tasks
 *   ?is_cleaning=true|false &property_id= &from=YYYY-MM-DD &to=YYYY-MM-DD (due date)
 *   &status=pending,in_progress &contractor_id= &booking_id= &limit= &offset=
 */
export const GET = withAgent('tasks:read', async (request, { db }) => {
  const url = new URL(request.url)
  const p = url.searchParams
  const { limit, offset } = paging(url)

  let q = db
    .from('tasks')
    .select(TASK_COLUMNS)
    .order('due_date', { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (p.get('is_cleaning')) q = q.eq('is_cleaning', p.get('is_cleaning') === 'true')
  if (p.get('property_id')) q = q.eq('property_id', p.get('property_id')!)
  if (p.get('from')) q = q.gte('due_date', p.get('from')!)
  if (p.get('to')) q = q.lte('due_date', p.get('to')!)
  if (p.get('status')) q = q.in('status', p.get('status')!.split(',').map(s => s.trim()))
  if (p.get('contractor_id')) q = q.eq('contractor_id', p.get('contractor_id')!)
  if (p.get('booking_id')) q = q.eq('booking_id', p.get('booking_id')!)

  const { data, error } = await q
  if (error) throw new AgentError(500, error.message)
  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>
  return json({ tasks: rows.map(serializeTask), limit, offset })
})

/**
 * POST /api/agent/v1/tasks — e.g. a cleaning: {"property_id","is_cleaning":true,
 * "due_date","contractor_id"}. A date set here is locked: the daily cleaning
 * automation won't delete or duplicate it. Cleanings get the standard checklist.
 */
export const POST = withAgent('tasks:write', async (request, { db, audit }) => {
  const body = TaskCreate.parse(await readJson(request))

  let title = body.title
  if (!title) {
    if (!body.is_cleaning) throw new AgentError(400, 'title is required for non-cleaning tasks.')
    const { data: prop } = await db.from('properties').select('name').eq('id', body.property_id).maybeSingle()
    title = `Cleaning — ${prop?.name ?? 'property'}`
  }

  const { data: task, error } = await db
    .from('tasks')
    .insert({
      property_id: body.property_id,
      title,
      description: body.description ?? null,
      is_cleaning: body.is_cleaning,
      due_date: body.due_date ?? null,
      contractor_id: body.contractor_id ?? null,
      booking_id: body.booking_id ?? null,
      status: body.status,
      priority: body.priority ?? (body.is_cleaning ? 'high' : 'normal'),
      notes: body.notes ?? null,
      schedule_locked: !!body.due_date,
    })
    .select('id')
    .single()
  if (error || !task) throw new AgentError(400, error?.message ?? 'Insert failed')

  if (body.is_cleaning) {
    await db.from('task_checklist_items').insert(
      CLEANING_CHECKLIST.map((label, index) => ({ task_id: task.id, label, sort_order: index })),
    )
  }

  const created = serializeTask(await loadTask(db, task.id))
  await audit({ resource: 'task', resourceId: task.id, action: 'create', after: created })
  refreshAdminPages('/tasks', `/properties/${body.property_id}`)
  return json({ task: created }, 201)
})
