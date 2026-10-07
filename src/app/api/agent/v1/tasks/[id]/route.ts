import { AgentError, json, readJson, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { TaskPatch, loadTask, serializeTask } from '@/lib/agent-api/tasks'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = withAgent<Params>('tasks:read', async (_request, { db }, { id }) => {
  return json({ task: serializeTask(await loadTask(db, id)) })
})

/**
 * PATCH /api/agent/v1/tasks/:id — move ({"due_date"}), reassign
 * ({"contractor_id"}), complete ({"status":"completed"}), etc. Changing the
 * date locks it so the cleaning automation leaves the task alone.
 */
export const PATCH = withAgent<Params>('tasks:write', async (request, { db, audit }, { id }) => {
  const patch = TaskPatch.parse(await readJson(request))
  if (Object.keys(patch).length === 0) throw new AgentError(400, 'No fields to update.')
  const before = await loadTask(db, id)
  const beforeView = serializeTask(before)

  const row: Record<string, unknown> = { ...patch }
  if (patch.due_date !== undefined) row.schedule_locked = true
  if (patch.status !== undefined) {
    row.completed_at = patch.status === 'completed' ? (before.completed_at ?? new Date().toISOString()) : null
  }

  const { error } = await db.from('tasks').update(row).eq('id', id)
  if (error) throw new AgentError(400, error.message)

  const task = serializeTask(await loadTask(db, id))
  await audit({ resource: 'task', resourceId: id, action: 'update', before: beforeView, after: task })
  refreshAdminPages('/tasks', `/tasks/${id}`, `/properties/${task.property_id}`)
  return json({ task })
})

export const DELETE = withAgent<Params>('tasks:write', async (_request, { db, audit }, { id }) => {
  const before = await loadTask(db, id)
  const { error } = await db.from('tasks').delete().eq('id', id)
  if (error) throw new AgentError(400, error.message)
  await audit({ resource: 'task', resourceId: id, action: 'delete', before: serializeTask(before) })
  refreshAdminPages('/tasks', `/properties/${before.property_id}`)
  return json({ deleted: true, id })
})
