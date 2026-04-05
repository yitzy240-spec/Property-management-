export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function ContractorsPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: contractors } = await serviceClient
    .from('contractors')
    .select('*')
    .eq('is_active', true)
    .order('name')

  const today = new Date().toISOString().split('T')[0]

  const contractorItineraries = await Promise.all(
    (contractors ?? []).map(async (contractor) => {
      const { data: tasks } = await serviceClient
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
        <h1 className="text-lg font-semibold tracking-tight">Contractor Itineraries</h1>
        <p className="text-xs text-muted-foreground">
          Open tasks by contractor — today&apos;s jobs at a glance.
        </p>
      </div>

      {contractorItineraries.length > 0 ? (
        contractorItineraries.map(({ contractor, todayTasks, upcomingTasks, totalOpen }) => (
          <section key={contractor.id} className="rounded-[10px] border border-border bg-card shadow-sm">
            {/* Contractor header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">{contractor.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {contractor.specialty && `${contractor.specialty} · `}
                  {contractor.phone}
                </p>
              </div>
              <span className="font-mono text-xs font-medium text-muted-foreground">{totalOpen} open</span>
            </div>

            <div className="p-4">
              {todayTasks.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                          <StatusBadge status={task.status} size="sm" />
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
                <div className={todayTasks.length > 0 ? 'mt-4 border-t border-border pt-4' : ''}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                          <StatusBadge status={task.priority} size="sm" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {totalOpen === 0 && (
                <p className="py-2 text-sm text-muted-foreground">No open tasks</p>
              )}
            </div>
          </section>
        ))
      ) : (
        <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">
          No active contractors.
        </div>
      )}
    </div>
  )
}
