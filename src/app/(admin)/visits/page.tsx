export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { getPropertyVisitStatuses } from '@/lib/visits'
import { Button } from '@/components/ui/button'
import { VisitList } from '@/components/features/visit-list'
import { DeleteVisitButton } from '@/components/features/delete-visit-button'

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: { property?: string }
}) {
  const supabase = createServiceClient()

  // If filtered by property, show visit history for that property
  if (searchParams.property) {
    const { data: property } = await supabase
      .from('properties')
      .select('id, name')
      .eq('id', searchParams.property)
      .single()

    const { data: visits } = await supabase
      .from('visits')
      .select('*')
      .eq('property_id', searchParams.property)
      .order('visited_at', { ascending: false })

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/visits" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Visit History</h1>
            <p className="text-xs text-muted-foreground">{property?.name ?? 'Property'} · {visits?.length ?? 0} visits</p>
          </div>
          <div className="ml-auto">
            <Link href={`/visits/new?property=${searchParams.property}&name=${encodeURIComponent(property?.name ?? '')}`}>
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-accent text-accent-foreground hover:bg-accent/90">
                Log Visit
              </Button>
            </Link>
          </div>
        </div>

        {visits && visits.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {visits.map((visit, i) => {
              const checklist = (visit.checklist as Record<string, boolean>) ?? {}
              const checkedCount = Object.values(checklist).filter(Boolean).length

              return (
                <div key={visit.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {new Date(visit.visited_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {checkedCount} item{checkedCount !== 1 ? 's' : ''} checked
                      </p>
                      {visit.note && (
                        <p className="mt-1 text-xs text-muted-foreground">{visit.note}</p>
                      )}
                      {visit.admin_note && (
                        <p className="mt-1 text-[11px] text-accent">📌 {visit.admin_note}</p>
                      )}
                    </div>
                    <DeleteVisitButton visitId={visit.id} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">
            No visits logged yet
          </div>
        )}
      </div>
    )
  }

  // Default: show visit schedule (all properties)
  const statuses = await getPropertyVisitStatuses(supabase)

  const thisWeek = statuses.filter(s => !s.is_occupied && daysUntil(s.next_visit_due) <= 7)
    .sort((a, b) => daysUntil(a.next_visit_due) - daysUntil(b.next_visit_due))
  const later = statuses.filter(s => !s.is_occupied && daysUntil(s.next_visit_due) > 7)
    .sort((a, b) => daysUntil(a.next_visit_due) - daysUntil(b.next_visit_due))
  const occupied = statuses.filter(s => s.is_occupied)

  const sections = [
    { key: 'this_week', label: 'This Week', items: thisWeek },
    { key: 'later', label: 'Later', items: later },
    { key: 'occupied', label: 'Occupied', items: occupied },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Visits</h1>
        <p className="text-xs text-muted-foreground">
          {statuses.length} properties · {thisWeek.filter(s => daysUntil(s.next_visit_due) < 0).length} overdue
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.key}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {section.label} ({section.items.length})
          </p>

          {section.items.length > 0 ? (
            <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
              {section.items.map((property, i) => {
                const days = daysUntil(property.next_visit_due)
                const isOverdue = days < 0 && !property.is_occupied
                const isDueSoon = days >= 0 && days <= 7 && !property.is_occupied

                return (
                  <div
                    key={property.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''} ${isOverdue ? 'border-l-[3px] border-l-destructive' : isDueSoon ? 'border-l-[3px] border-l-status-warning' : ''}`}
                  >
                    <Link href={`/visits?property=${property.id}`} className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{property.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {property.is_occupied ? (
                          <>
                            {property.occupancy_type === 'owner_stay' ? 'Owner stay until' : 'Guest checkout'}:{' '}
                            {formatDate(property.occupancy_end!)} ·{' '}
                            <span className="text-muted-foreground">
                              Visits resume {formatDate(
                                new Date(new Date(property.occupancy_end!).getTime() + 14 * 24 * 60 * 60 * 1000)
                                  .toISOString().split('T')[0]
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            Last visit: {property.last_visit_date ? formatDate(property.last_visit_date) : 'Never'} ·{' '}
                            {isOverdue ? (
                              <span className="font-semibold text-destructive">{Math.abs(days)} days overdue</span>
                            ) : (
                              `Due in ${days} days`
                            )}
                          </>
                        )}
                      </p>
                      {property.last_admin_note && !property.is_occupied && (
                        <p className="mt-1 text-[11px] text-accent">
                          📌 {property.last_admin_note}
                        </p>
                      )}
                    </Link>

                    {property.is_occupied ? (
                      <span className="shrink-0 rounded-[var(--radius-badge)] border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        Occupied
                      </span>
                    ) : (
                      <Link href={`/visits/new?property=${property.id}&name=${encodeURIComponent(property.name)}`}>
                        <Button
                          size="sm"
                          className={`h-8 text-xs ${
                            section.key === 'this_week'
                              ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                              : ''
                          }`}
                          variant={section.key === 'this_week' ? 'default' : 'outline'}
                        >
                          Log Visit
                        </Button>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">
              No properties
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
