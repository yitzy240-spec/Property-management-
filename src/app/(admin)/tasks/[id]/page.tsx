export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { TaskActions } from '@/components/features/task-actions'
import { TaskChecklist } from '@/components/features/task-checklist'

export default async function TaskDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const serviceClient = createServiceClient()

  const { data: task } = await serviceClient
    .from('tasks')
    .select('*, properties(name, address), contractors(name, phone)')
    .eq('id', params.id)
    .single()

  if (!task) notFound()

  const { data: checklistItems } = await serviceClient
    .from('task_checklist_items')
    .select('*')
    .eq('task_id', params.id)
    .order('sort_order')

  const { data: media } = await serviceClient
    .from('task_media')
    .select('*')
    .eq('task_id', params.id)
    .order('created_at', { ascending: false })

  const property = task.properties as { name: string; address: string } | null
  const contractor = task.contractors as { name: string; phone: string | null } | null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/tasks" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{task.title}</h1>
              <StatusBadge status={task.status} size="sm" />
              {task.priority !== 'normal' && (
                <StatusBadge status={task.priority} size="sm" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {property?.name} — {property?.address}
            </p>
          </div>
        </div>
      </div>

      {/* Task Actions — edit, status change, reassign, cancel */}
      <TaskActions
        taskId={task.id}
        propertyId={task.property_id}
        currentStatus={task.status}
        currentPriority={task.priority}
        currentContractorId={task.contractor_id}
        currentTitle={task.title}
        currentDescription={task.description}
        dueDate={task.due_date}
      />

      {/* Details */}
      <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Contractor</p>
            <p className="mt-0.5 text-sm font-medium">{contractor?.name || 'Unassigned'}</p>
            {contractor?.phone && <p className="font-mono text-xs text-muted-foreground">{contractor.phone}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Due Date</p>
            <p className="mt-0.5 text-sm font-medium">{task.due_date || 'No due date'}</p>
          </div>
          {task.description && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Description</p>
              <p className="mt-0.5 text-sm">{task.description}</p>
            </div>
          )}
          {task.expense_agorot > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Expense</p>
              <CurrencyDisplay agorot={task.expense_agorot} className="mt-0.5 text-sm font-semibold" />
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {task.is_seasonal && <StatusBadge status="neutral" label="Seasonal" size="sm" />}
          {task.is_cleaning && <StatusBadge status="neutral" label="Cleaning" size="sm" />}
          {task.is_routine_check && <StatusBadge status="neutral" label="Routine" size="sm" />}
        </div>
      </div>

      {/* Checklist */}
      {checklistItems && checklistItems.length > 0 && (
        <TaskChecklist 
          items={(checklistItems ?? []).map(item => ({
            id: item.id,
            label: item.label,
            is_completed: item.is_completed,
            ai_generated: item.ai_generated,
          }))}
          taskId={params.id}
        />
      )}

      {/* Media */}
      {media && media.length > 0 && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Photos ({media.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {media.map((m) => (
              <a
                key={m.id}
                href={`/api/download?path=${encodeURIComponent(m.storage_path)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-[4/3] overflow-hidden rounded-[10px] border border-border bg-muted"
              >
                <img
                  src={`/api/download?path=${encodeURIComponent(m.storage_path)}`}
                  alt={m.caption || 'Task photo'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
