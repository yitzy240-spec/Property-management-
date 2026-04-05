export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Separator } from '@/components/ui/separator'

export default async function ContractorsPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  // Get all active contractors with their open tasks
  const { data: contractors } = await supabase
    .from('contractors')
    .select('*')
    .eq('is_active', true)
    .order('name')

  const today = new Date().toISOString().split('T')[0]

  // For each contractor, get their open tasks with property info
  const contractorItineraries = await Promise.all(
    (contractors ?? []).map(async (contractor) => {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*, properties(name, address, entry_code)')
        .eq('contractor_id', contractor.id)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true })

      const todayTasks = (tasks ?? []).filter(t => t.due_date === today)
      const upcomingTasks = (tasks ?? []).filter(t => t.due_date !== today)

      return { contractor, todayTasks, upcomingTasks, totalOpen: (tasks ?? []).length }
    })
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contractor Itineraries</h1>
        <p className="text-sm text-muted-foreground">
          Open tasks by contractor — today&apos;s jobs at a glance.
        </p>
      </div>

      {contractorItineraries.length > 0 ? (
        contractorItineraries.map(({ contractor, todayTasks, upcomingTasks, totalOpen }) => (
          <Card key={contractor.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{contractor.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {contractor.specialty && `${contractor.specialty} · `}
                    {contractor.phone}
                  </p>
                </div>
                <Badge variant={totalOpen > 0 ? 'default' : 'secondary'}>
                  {totalOpen} open
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayTasks.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Today&apos;s Jobs
                  </p>
                  {todayTasks.map((task) => {
                    const property = task.properties as { name: string; address: string; entry_code: string | null } | null
                    return (
                      <div key={task.id} className="mb-2 rounded-lg border border-l-4 border-l-primary p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {property?.name} — {property?.address}
                            </p>
                          </div>
                          <StatusBadge status={task.status} />
                        </div>
                        {property?.entry_code && (
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            Code: {property.entry_code}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {upcomingTasks.length > 0 && (
                <div>
                  {todayTasks.length > 0 && <Separator className="my-2" />}
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Upcoming
                  </p>
                  {upcomingTasks.map((task) => {
                    const property = task.properties as { name: string; address: string } | null
                    return (
                      <div key={task.id} className="mb-2 rounded-lg border p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {property?.name} · Due {task.due_date}
                            </p>
                          </div>
                          <StatusBadge status={task.priority} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {totalOpen === 0 && (
                <p className="py-2 text-sm text-muted-foreground">No open tasks</p>
              )}
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No active contractors. Add contractors in the database to see their itineraries.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
