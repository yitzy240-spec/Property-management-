'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, List, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

// ── Types ──

export type EventType = 'checkout' | 'checkin' | 'cleaning' | 'bill' | 'task' | 'contractor'

export interface CalendarEvent {
  id: string
  date: string // YYYY-MM-DD
  type: EventType
  title: string
  property: string
  detail?: string
  urgent?: boolean
}

interface CalendarGridProps {
  events: CalendarEvent[]
  view: 'calendar' | 'list'
  onViewChange: (v: 'calendar' | 'list') => void
  selectedDate?: Date
  onDaySelect?: (d: Date) => void
  initialMonth?: Date
  showLegend?: boolean
}

// ── Event Config ──

const EVENT_CONFIG: Record<EventType, { label: string; dotClass: string; borderClass: string; status: string }> = {
  checkout: { label: 'Check-Out', dotClass: 'bg-[hsl(var(--event-checkout))]', borderClass: 'border-l-[hsl(var(--event-checkout))]', status: 'info' },
  checkin: { label: 'Check-In', dotClass: 'bg-[hsl(var(--event-checkin))]', borderClass: 'border-l-[hsl(var(--event-checkin))]', status: 'info' },
  cleaning: { label: 'Cleaning', dotClass: 'bg-[hsl(var(--event-clean))]', borderClass: 'border-l-[hsl(var(--event-clean))]', status: 'neutral' },
  bill: { label: 'Bill', dotClass: 'bg-status-warning', borderClass: 'border-l-status-warning', status: 'warning' },
  task: { label: 'Task', dotClass: 'bg-status-info', borderClass: 'border-l-status-info', status: 'info' },
  contractor: { label: 'Contractor', dotClass: 'bg-status-safe', borderClass: 'border-l-status-safe', status: 'safe' },
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Helpers ──

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(a: string, b: string): boolean {
  return a === b
}

function getMonthDays(year: number, month: number): { date: Date; dateStr: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1)
  const startDay = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days: { date: Date; dateStr: string; inMonth: boolean }[] = []

  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, dateStr: toDateStr(d), inMonth: false })
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    days.push({ date: d, dateStr: toDateStr(d), inMonth: true })
  }

  // Next month padding to complete grid (6 rows max)
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - startDay - daysInMonth + 1)
    days.push({ date: d, dateStr: toDateStr(d), inMonth: false })
  }

  return days
}

// ── Component ──

export function CalendarGrid({
  events,
  view,
  onViewChange,
  selectedDate: controlledSelected,
  onDaySelect,
  initialMonth,
  showLegend = true,
}: CalendarGridProps) {
  const today = useMemo(() => toDateStr(new Date()), [])
  const [month, setMonth] = useState(() => {
    const d = initialMonth || new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedStr, setSelectedStr] = useState<string | null>(
    controlledSelected ? toDateStr(controlledSelected) : null
  )

  const days = useMemo(() => getMonthDays(month.year, month.month), [month.year, month.month])

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return map
  }, [events])

  const monthLabel = new Date(month.year, month.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function navigate(offset: number) {
    setMonth(prev => {
      const d = new Date(prev.year, prev.month + offset)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
    setSelectedStr(null)
  }

  function selectDay(dateStr: string, date: Date) {
    setSelectedStr(prev => prev === dateStr ? null : dateStr)
    onDaySelect?.(date)
  }

  const selectedEvents = selectedStr ? (eventsByDate.get(selectedStr) || []) : []
  const isCompact = selectedStr !== null

  // ── List View ──

  if (view === 'list') {
    // Group events by date, chronological
    const sortedDates = [...eventsByDate.keys()].sort()
    const monthDates = sortedDates.filter(d => {
      const date = new Date(d + 'T00:00:00')
      return date.getFullYear() === month.year && date.getMonth() === month.month
    })

    return (
      <div className="space-y-5">
        {/* Month nav */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 rounded-md hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold">{monthLabel}</span>
          <button onClick={() => navigate(1)} className="p-2 rounded-md hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>

        {monthDates.length > 0 ? monthDates.map(dateStr => {
          const dayEvents = eventsByDate.get(dateStr) || []
          const date = new Date(dateStr + 'T00:00:00')
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const isToday = dateStr === today

          return (
            <section key={dateStr}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground">{dayLabel}</h3>
                {isToday && (
                  <span className="rounded-[var(--radius-badge)] bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">Today</span>
                )}
              </div>
              <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
                {dayEvents.map((event, i) => {
                  const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.task
                  return (
                    <div
                      key={event.id}
                      className={cn(
                        'flex items-center justify-between border-l-4 px-4 py-3',
                        config.borderClass,
                        i > 0 && 'border-t border-border'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={config.status} label={config.label} size="sm" />
                          <span className="truncate text-sm font-medium">{event.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {event.property}{event.detail ? ` · ${event.detail}` : ''}
                        </p>
                      </div>
                      {event.urgent && (
                        <TriangleAlert className="h-4 w-4 shrink-0 text-status-danger" />
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        }) : (
          <div className="rounded-[10px] border border-border bg-card py-12 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">No events this month</p>
          </div>
        )}
      </div>
    )
  }

  // ── Calendar View ──

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <button onClick={() => navigate(1)} className="p-2 rounded-md hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center">
        {DAY_NAMES.map(d => (
          <div key={d} className="py-1 text-[11px] font-semibold text-muted-foreground">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border-t border-l border-border rounded-[10px] overflow-hidden bg-card shadow-sm">
        {days.map(({ date, dateStr, inMonth }) => {
          const dayEvents = eventsByDate.get(dateStr) || []
          const isToday = dateStr === today
          const isSelected = dateStr === selectedStr
          const dots = dayEvents.slice(0, 3)
          const hasUrgent = dayEvents.some(e => e.urgent)

          return (
            <button
              key={dateStr}
              onClick={() => inMonth && selectDay(dateStr, date)}
              disabled={!inMonth}
              className={cn(
                'relative border-r border-b border-border p-1 text-left transition-colors',
                isCompact ? 'h-12' : 'h-[68px]',
                inMonth ? 'hover:bg-muted/50' : 'bg-muted/20 text-muted-foreground/40',
                isSelected && 'bg-[#FFF7ED]',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                  isToday && !isSelected && 'bg-primary text-primary-foreground',
                  isSelected && 'bg-accent text-accent-foreground',
                  !isToday && !isSelected && 'text-foreground',
                )}
              >
                {date.getDate()}
              </span>

              {/* Event dots */}
              {dots.length > 0 && (
                <div className={cn('flex gap-0.5 mt-0.5', isCompact ? 'absolute bottom-1 left-1' : 'mt-1')}>
                  {dots.map((e, i) => (
                    <span key={i} className={cn('h-1.5 w-1.5 rounded-full', EVENT_CONFIG[e.type]?.dotClass || 'bg-muted-foreground')} />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-muted-foreground leading-none">+{dayEvents.length - 3}</span>
                  )}
                </div>
              )}

              {hasUrgent && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-status-danger" />
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      {showLegend && !isCompact && (
        <div className="flex flex-wrap gap-3 px-1">
          {Object.entries(EVENT_CONFIG)
            .filter(([type]) => events.some(e => e.type === type))
            .map(([type, config]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', config.dotClass)} />
                <span className="text-[11px] text-muted-foreground">{config.label}</span>
              </div>
            ))}
        </div>
      )}

      {/* Day detail panel */}
      {selectedStr && (
        <div className="rounded-[10px] border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground">
              {new Date(selectedStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {selectedEvents.length > 0 ? selectedEvents.map((event, i) => {
            const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.task
            return (
              <div
                key={event.id}
                className={cn(
                  'flex items-center justify-between border-l-4 px-4 py-3',
                  config.borderClass,
                  i > 0 && 'border-t border-border'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={config.status} label={config.label} size="sm" />
                    <span className="truncate text-sm font-medium">{event.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {event.property}{event.detail ? ` · ${event.detail}` : ''}
                  </p>
                </div>
                {event.urgent && (
                  <TriangleAlert className="h-4 w-4 shrink-0 text-status-danger" />
                )}
              </div>
            )
          }) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No events
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── View Toggle ──

export function CalendarViewToggle({
  view,
  onViewChange,
}: {
  view: 'calendar' | 'list'
  onViewChange: (v: 'calendar' | 'list') => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      <button
        onClick={() => onViewChange('calendar')}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          view === 'calendar' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Cal
      </button>
      <button
        onClick={() => onViewChange('list')}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          view === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <List className="h-3.5 w-3.5" />
        List
      </button>
    </div>
  )
}
