import { cn } from '@/lib/utils'

type DateFormat = 'short' | 'long' | 'relative' | 'time' | 'datetime'

interface DateDisplayProps {
  /** ISO date string or Date object */
  date: string | Date
  format?: DateFormat
  className?: string
}

const JERUSALEM_TZ = 'Asia/Jerusalem'

/**
 * Universal date/time display component.
 * - Always renders in Asia/Jerusalem timezone
 * - Multiple format options
 * - Consistent across the app
 */
export function DateDisplay({
  date,
  format = 'short',
  className,
}: DateDisplayProps) {
  const d = typeof date === 'string' ? new Date(date) : date

  let formatted: string

  switch (format) {
    case 'short':
      formatted = d.toLocaleDateString('en-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: JERUSALEM_TZ,
      })
      break

    case 'long':
      formatted = d.toLocaleDateString('en-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: JERUSALEM_TZ,
      })
      break

    case 'relative': {
      const now = new Date()
      const diffMs = d.getTime() - now.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) formatted = 'Today'
      else if (diffDays === 1) formatted = 'Tomorrow'
      else if (diffDays === -1) formatted = 'Yesterday'
      else if (diffDays > 0 && diffDays < 7) formatted = `In ${diffDays} days`
      else if (diffDays < 0 && diffDays > -7) formatted = `${Math.abs(diffDays)} days ago`
      else formatted = d.toLocaleDateString('en-IL', {
        day: 'numeric',
        month: 'short',
        timeZone: JERUSALEM_TZ,
      })
      break
    }

    case 'time':
      formatted = d.toLocaleTimeString('en-IL', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: JERUSALEM_TZ,
      })
      break

    case 'datetime':
      formatted = d.toLocaleString('en-IL', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: JERUSALEM_TZ,
      })
      break
  }

  return (
    <time
      dateTime={d.toISOString()}
      className={cn('text-muted-foreground', className)}
    >
      {formatted}
    </time>
  )
}
