import Link from 'next/link'
import { VISIT_CHECKLIST_ITEMS, type ChecklistKey } from '@/types'

interface VisitRow {
  id: string
  property_id: string
  visited_at: string
  checklist: Partial<Record<ChecklistKey, boolean>>
  note: string | null
  created_at: string
  properties?: { name: string } | null
}

interface VisitListProps {
  visits: VisitRow[]
  showPropertyName?: boolean
  viewAllHref?: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function checklistCount(checklist: Partial<Record<ChecklistKey, boolean>>): number {
  return Object.values(checklist).filter(Boolean).length
}

export function VisitList({ visits, showPropertyName, viewAllHref }: VisitListProps) {
  if (visits.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">
        No visits yet
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
        {visits.map((visit, i) => {
          const count = checklistCount(visit.checklist)
          const completedItems = VISIT_CHECKLIST_ITEMS.filter(item => visit.checklist[item.key])

          return (
            <details
              key={visit.id}
              className={`group ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{formatDate(visit.visited_at)}</p>
                    {showPropertyName && visit.properties && (
                      <span className="truncate rounded-[var(--radius-badge)] bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {visit.properties.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {count} item{count !== 1 ? 's' : ''} checked
                    {visit.note && ` · ${visit.note.slice(0, 50)}${visit.note.length > 50 ? '...' : ''}`}
                  </p>
                </div>
                <span className="ml-2 text-xs text-muted-foreground transition-transform group-open:rotate-90">&#9654;</span>
              </summary>
              <div className="space-y-2 border-t border-border px-4 py-3">
                {completedItems.length > 0 && (
                  <ul className="space-y-1">
                    {completedItems.map(item => (
                      <li key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-status-safe">&#10003;</span>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                )}
                {visit.note && (
                  <p className="text-xs text-muted-foreground">{visit.note}</p>
                )}
              </div>
            </details>
          )
        })}
      </div>
      {viewAllHref && (
        <Link href={viewAllHref} className="block text-center text-xs font-medium text-accent hover:underline">
          View all visits
        </Link>
      )}
    </div>
  )
}
