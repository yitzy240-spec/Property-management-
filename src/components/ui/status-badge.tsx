import { cn } from '@/lib/utils'

type StatusType = 'safe' | 'warning' | 'danger' | 'info' | 'neutral'

interface StatusBadgeProps {
  status: StatusType | string
  label?: string
  className?: string
  size?: 'sm' | 'md'
}

/** Map common app statuses to semantic status types */
const statusMap: Record<string, StatusType> = {
  // Task statuses
  pending: 'warning',
  in_progress: 'info',
  completed: 'safe',
  cancelled: 'neutral',
  // Bill statuses
  pending_review: 'warning',
  approved: 'safe',
  flagged: 'danger',
  rejected: 'neutral',
  // Priority
  urgent: 'danger',
  high: 'warning',
  normal: 'neutral',
  low: 'neutral',
  // Generic
  active: 'safe',
  inactive: 'neutral',
  overdue: 'danger',
  due_soon: 'warning',
}

const statusStyles: Record<StatusType, string> = {
  safe: 'bg-status-safe/15 text-status-safe border-status-safe/20',
  warning: 'bg-status-warning/15 text-status-warning border-status-warning/20',
  danger: 'bg-status-danger/15 text-status-danger border-status-danger/20',
  info: 'bg-status-info/15 text-status-info border-status-info/20',
  neutral: 'bg-muted text-muted-foreground border-border',
}

/**
 * Token-driven status badge.
 * Accepts either a semantic status type ('safe', 'warning', etc.)
 * or an app-specific status string ('pending', 'approved', etc.)
 * which gets mapped to the semantic type automatically.
 */
export function StatusBadge({
  status,
  label,
  className,
  size = 'sm',
}: StatusBadgeProps) {
  const semanticStatus = statusMap[status] || (status as StatusType) || 'neutral'
  const displayLabel = label || status.replace(/_/g, ' ')

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-badge)] border font-medium capitalize',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
        statusStyles[semanticStatus],
        className
      )}
    >
      {displayLabel}
    </span>
  )
}

/**
 * Small status dot indicator (no label).
 */
export function StatusDot({
  status,
  className,
}: {
  status: StatusType | string
  className?: string
}) {
  const semanticStatus = statusMap[status] || (status as StatusType) || 'neutral'

  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        semanticStatus === 'safe' && 'bg-status-safe',
        semanticStatus === 'warning' && 'bg-status-warning',
        semanticStatus === 'danger' && 'bg-status-danger',
        semanticStatus === 'info' && 'bg-status-info',
        semanticStatus === 'neutral' && 'bg-muted-foreground',
        className
      )}
    />
  )
}
