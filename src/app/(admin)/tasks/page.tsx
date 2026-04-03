export const dynamic = 'force-dynamic'

import { ClipboardList } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskCreateDialog } from '@/components/features/task-create-dialog'

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  normal: '',
  low: 'bg-gray-100 text-gray-600',
}

export default async function TasksPage() {
  const supabase = createServerSupabaseClient()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, properties(name), contractors(name)')
    .order('created_at', { ascending: false })

  const pending = tasks?.filter((t) => t.status === 'pending') ?? []
  const inProgress = tasks?.filter((t) => t.status === 'in_progress') ?? []
  const completed = tasks?.filter((t) => t.status === 'completed') ?? []

  function TaskList({ items }: { items: typeof tasks }) {
    if (!items || items.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No tasks in this status
        </p>
      )
    }

    return (
      <div className="space-y-2">
        {items.map((task) => (
          <Card key={task.id} className="transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{task.title}</h3>
                    {task.priority !== 'normal' && (
                      <Badge className={`text-[10px] ${priorityColors[task.priority]}`}>
                        {task.priority}
                      </Badge>
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
                      <Badge variant="outline" className="text-[10px]">
                        {(task.contractors as { name: string }).name}
                      </Badge>
                    )}
                    {task.due_date && (
                      <span className="text-[10px] text-muted-foreground">
                        Due {task.due_date}
                      </span>
                    )}
                    {task.is_seasonal && (
                      <Badge variant="secondary" className="text-[10px]">Seasonal</Badge>
                    )}
                    {task.is_cleaning && (
                      <Badge variant="secondary" className="text-[10px]">Cleaning</Badge>
                    )}
                  </div>
                </div>
                <Badge className={`shrink-0 text-[10px] ${statusColors[task.status]}`}>
                  {task.status.replace('_', ' ')}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {tasks?.length ?? 0} total tasks
          </p>
        </div>
        <TaskCreateDialog />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="in_progress">
            In Progress ({inProgress.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <TaskList items={pending} />
        </TabsContent>
        <TabsContent value="in_progress" className="mt-4">
          <TaskList items={inProgress} />
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <TaskList items={completed} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
