'use client'

import { VISIT_CHECKLIST_ITEMS, type ChecklistKey } from '@/types'

interface VisitChecklistProps {
  checked: Set<ChecklistKey>
  onChange: (key: ChecklistKey, value: boolean) => void
  readOnly?: boolean
}

export function VisitChecklist({ checked, onChange, readOnly }: VisitChecklistProps) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
      {VISIT_CHECKLIST_ITEMS.map((item, i) => (
        <label
          key={item.key}
          className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 ${
            i > 0 ? 'border-t border-border' : ''
          } ${readOnly ? 'pointer-events-none' : ''}`}
        >
          <input
            type="checkbox"
            checked={checked.has(item.key)}
            onChange={(e) => onChange(item.key, e.target.checked)}
            disabled={readOnly}
            className="h-4 w-4 rounded border-border text-accent accent-accent"
          />
          <span className="text-sm">{item.label}</span>
        </label>
      ))}
    </div>
  )
}

export function VisitChecklistSummary({ checklist }: { checklist: Partial<Record<ChecklistKey, boolean>> }) {
  const completed = VISIT_CHECKLIST_ITEMS.filter(item => checklist[item.key])
  if (completed.length === 0) return null

  return (
    <ul className="space-y-1">
      {completed.map(item => (
        <li key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-status-safe">&#10003;</span>
          {item.label}
        </li>
      ))}
    </ul>
  )
}
