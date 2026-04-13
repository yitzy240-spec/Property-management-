'use client'

import { useState } from 'react'
import { CalendarGrid, CalendarViewToggle, type CalendarEvent } from './calendar-grid'

interface TurnoverCalendarProps {
  events: CalendarEvent[]
}

export function TurnoverCalendar({ events }: TurnoverCalendarProps) {
  const [view, setView] = useState<'calendar' | 'list'>('calendar')

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Turnover Calendar</h1>
          <p className="text-xs text-muted-foreground">
            Check-outs, cleaning windows, and check-ins
          </p>
        </div>
        <CalendarViewToggle view={view} onViewChange={setView} />
      </div>

      <CalendarGrid
        events={events}
        view={view}
        onViewChange={setView}
        showLegend
      />
    </>
  )
}
