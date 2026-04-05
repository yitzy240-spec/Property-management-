export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'
import { TaskCreateDialog } from '@/components/features/task-create-dialog'

export default async function TasksPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: tasks } = await serviceClient
    .from('tasks')
    .select('*, properties(name), contractors(name)')
    .order('created_at', { ascending: false })

  const pending = tasks?.filter((t) => t.status === 'pending') ?? []
  const inProgress = tasks?.filter((t) => t.status === 'in_progress') ?? []
  const completed = tasks?.filter((t) => t.status === 'completed') ?? []

  const sections = [
    { key: 'pending', label: 'Pending', items: pending },
    { key: 'in_progress', label: 'In Progress', items: inProgress },
    { key: 'completed', label: 'Completed', items: completed },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          <p className="text-xs text-muted-foreground">
            {tasks?.length ?? 0} total
          </p>
        </div>
        <TaskCreateDialog />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <div className="bg-card px-3 py-3 text-center">
          <p className="font-mono text-lg font-bold text-status-warning">{pending.length}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </div>
        <div className="bg-card px-3 py-3 text-center">
          <p className="font-mono text-lg font-bold text-status-info">{inProgress.length}</p>
          <p className="text-xs text-muted-foreground">In Progress</p>
        </div>
        <div className="bg-card px-3 py-3 text-center">
          <p className="font-mono text-lg font-bold text-status-safe">{completed.length}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
      </div>

      {/* Task sections */}
      {sections.map((section) => (
        <section key={section.key}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {section.label} ({section.items.length})
          </p>

          {section.items.length > 0 ? (
            <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
              {section.items.map((task, i) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className="block">
                  <div className={`flex items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 ${i > 0 ? 'border-t border-border' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{task.title}</h3>
                        {task.priority !== 'normal' && (
                          <StatusBadge status={task.priority} size="sm" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {(task.properties as { name: string } | null)?.name || 'No property'}
                      </p>
                      {task.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(task.contractors as { name: string } | null)?.name && (
                          <span className="rounded-[var(--radius-badge)] border border-border px-1.5 py-0.5 text-xs font-medium">
                            {(task.contractors as { name: string }).name}
                          </span>
                        )}
                        {task.due_date && (
                          <span className="font-mono text-xs text-muted-foreground">
                            Due {task.due_date}
                          </span>
                        )}
                        {task.is_seasonal && (
                          <StatusBadge status="neutral" label="Seasonal" size="sm" />
                        )}
                        {task.is_cleaning && (
                          <StatusBadge status="neutral" label="Cleaning" size="sm" />
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={task.status} size="sm" />
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-[10px] border border-border bg-card py-6 text-center text-sm text-muted-foreground shadow-sm">
              No tasks in this status
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
