import { z } from 'zod'
import { AgentError, type ServiceClient } from './core'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const status = z.enum(['pending', 'in_progress', 'completed', 'cancelled'])
const priority = z.enum(['low', 'normal', 'high', 'urgent'])

export const TaskCreate = z
  .object({
    property_id: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).nullish(),
    is_cleaning: z.boolean().default(false),
    due_date: date.nullish(),
    contractor_id: z.string().uuid().nullish(),
    booking_id: z.string().uuid().nullish(),
    status: status.default('pending'),
    priority: priority.optional(),
    notes: z.string().max(4000).nullish(),
  })
  .strict()

export const TaskPatch = z
  .object({
    property_id: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(4000).nullable(),
    due_date: date.nullable(),
    contractor_id: z.string().uuid().nullable(),
    booking_id: z.string().uuid().nullable(),
    status,
    priority,
    notes: z.string().max(4000).nullable(),
  })
  .partial()
  .strict()

export const TASK_COLUMNS =
  'id, property_id, title, description, status, priority, due_date, is_cleaning, booking_id, contractor_id, ' +
  'schedule_locked, notes, completed_at, created_at, updated_at, properties(name), contractors(name)'

type TaskRow = Record<string, unknown> & { id: string }

export function serializeTask(t: TaskRow) {
  return {
    id: t.id,
    property_id: t.property_id,
    property_name: (t.properties as { name?: string } | null)?.name ?? null,
    title: t.title,
    description: t.description ?? null,
    is_cleaning: t.is_cleaning ?? false,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date ?? null,
    contractor_id: t.contractor_id ?? null,
    contractor_name: (t.contractors as { name?: string } | null)?.name ?? null,
    booking_id: t.booking_id ?? null,
    /** True when a person/agent set the date — the cleaning automation leaves it alone. */
    schedule_locked: t.schedule_locked ?? false,
    notes: t.notes ?? null,
    completed_at: t.completed_at ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }
}

export async function loadTask(db: ServiceClient, id: string): Promise<TaskRow> {
  const { data, error } = await db.from('tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Task not found.')
  return data as unknown as TaskRow
}
