/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarGrid, CalendarViewToggle, type CalendarEvent } from './calendar-grid'

// ── Test Data ──

const testEvents: CalendarEvent[] = [
  { id: 'co1', date: '2026-04-05', type: 'checkout', title: 'Check-out: Sruly', property: 'Agripas 8', detail: '10:00 AM' },
  { id: 'cl1', date: '2026-04-05', type: 'cleaning', title: 'Turnover clean', property: 'Agripas 8', detail: 'Scheduled' },
  { id: 'ci1', date: '2026-04-05', type: 'checkin', title: 'Check-in: Avi', property: 'Agripas 8', detail: '2:00 PM', urgent: true },
  { id: 'co2', date: '2026-04-10', type: 'checkout', title: 'Check-out: Moshe', property: 'Jerusalem Skyline' },
  { id: 'ci2', date: '2026-04-15', type: 'checkin', title: 'Check-in: Sara', property: 'Keren Hayesod 5', detail: '3:00 PM' },
]

// ── Date Helpers ──

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonthDays(year: number, month: number): { dateStr: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1)
  const startDay = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: { dateStr: string; inMonth: boolean }[] = []
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ dateStr: toDateStr(d), inMonth: false })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    days.push({ dateStr: toDateStr(d), inMonth: true })
  }
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - startDay - daysInMonth + 1)
    days.push({ dateStr: toDateStr(d), inMonth: false })
  }
  return days
}

function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    if (!map.has(e.date)) map.set(e.date, [])
    map.get(e.date)!.push(e)
  }
  return map
}

// ── Data Logic Tests ──

describe('toDateStr', () => {
  it('formats dates as YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 3, 1))).toBe('2026-04-01')
    expect(toDateStr(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('zero-pads month and day', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDateStr(new Date(2026, 8, 9))).toBe('2026-09-09')
  })
})

describe('getMonthDays', () => {
  it('returns correct number of in-month days', () => {
    expect(getMonthDays(2026, 3).filter(d => d.inMonth)).toHaveLength(30) // April
    expect(getMonthDays(2026, 1).filter(d => d.inMonth)).toHaveLength(28) // Feb
    expect(getMonthDays(2026, 0).filter(d => d.inMonth)).toHaveLength(31) // Jan
  })

  it('grid is always a multiple of 7 columns', () => {
    for (let m = 0; m < 12; m++) {
      expect(getMonthDays(2026, m).length % 7).toBe(0)
    }
  })

  it('includes padding days', () => {
    const days = getMonthDays(2026, 3) // April starts on Wednesday
    const padding = days.filter(d => !d.inMonth)
    expect(padding.length).toBeGreaterThan(0)
  })
})

describe('groupEventsByDate', () => {
  it('groups events correctly', () => {
    const grouped = groupEventsByDate(testEvents)
    expect(grouped.get('2026-04-05')).toHaveLength(3)
    expect(grouped.get('2026-04-10')).toHaveLength(1)
    expect(grouped.get('2026-04-15')).toHaveLength(1)
  })

  it('handles empty events', () => {
    expect(groupEventsByDate([]).size).toBe(0)
  })
})

// ── Component Render Tests ──

describe('CalendarViewToggle', () => {
  it('renders both buttons', () => {
    const onChange = vi.fn()
    render(<CalendarViewToggle view="calendar" onViewChange={onChange} />)
    expect(screen.getByText('Cal')).toBeDefined()
    expect(screen.getByText('List')).toBeDefined()
  })

  it('calls onViewChange when toggled', () => {
    const onChange = vi.fn()
    render(<CalendarViewToggle view="calendar" onViewChange={onChange} />)
    fireEvent.click(screen.getByText('List'))
    expect(onChange).toHaveBeenCalledWith('list')
  })

  it('calls onViewChange for calendar', () => {
    const onChange = vi.fn()
    render(<CalendarViewToggle view="list" onViewChange={onChange} />)
    fireEvent.click(screen.getByText('Cal'))
    expect(onChange).toHaveBeenCalledWith('calendar')
  })
})

describe('CalendarGrid — calendar view', () => {
  it('renders month name', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid
        events={testEvents}
        view="calendar"
        onViewChange={onChange}
        initialMonth={new Date(2026, 3, 1)}
      />
    )
    expect(screen.getByText('April 2026')).toBeDefined()
  })

  it('renders day-of-week headers', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid events={[]} view="calendar" onViewChange={onChange} initialMonth={new Date(2026, 3, 1)} />
    )
    expect(screen.getByText('Sun')).toBeDefined()
    expect(screen.getByText('Mon')).toBeDefined()
    expect(screen.getByText('Sat')).toBeDefined()
  })

  it('shows day detail panel when a day is clicked', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid
        events={testEvents}
        view="calendar"
        onViewChange={onChange}
        initialMonth={new Date(2026, 3, 1)}
      />
    )
    // Click on day 5 (has events)
    fireEvent.click(screen.getByText('5'))
    // Detail panel should show event titles
    expect(screen.getByText('Check-out: Sruly')).toBeDefined()
    expect(screen.getByText('Turnover clean')).toBeDefined()
    expect(screen.getByText('Check-in: Avi')).toBeDefined()
  })

  it('hides detail panel when same day is clicked again', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid
        events={testEvents}
        view="calendar"
        onViewChange={onChange}
        initialMonth={new Date(2026, 3, 1)}
      />
    )
    fireEvent.click(screen.getByText('5'))
    expect(screen.getByText('Check-out: Sruly')).toBeDefined()
    fireEvent.click(screen.getByText('5'))
    expect(screen.queryByText('Check-out: Sruly')).toBeNull()
  })

  it('navigates months with prev/next buttons', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid events={[]} view="calendar" onViewChange={onChange} initialMonth={new Date(2026, 3, 1)} />
    )
    expect(screen.getByText('April 2026')).toBeDefined()
    // Click next
    const buttons = screen.getAllByRole('button')
    const nextBtn = buttons.find(b => b.querySelector('svg'))
    // The last chevron button is "next"
    fireEvent.click(buttons[1]) // second button is next month
    expect(screen.getByText('May 2026')).toBeDefined()
  })

  it('shows legend with active event types only', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid
        events={[testEvents[0]]} // only checkout
        view="calendar"
        onViewChange={onChange}
        initialMonth={new Date(2026, 3, 1)}
        showLegend
      />
    )
    expect(screen.getByText('Check-Out')).toBeDefined()
    expect(screen.queryByText('Check-In')).toBeNull()
  })
})

describe('CalendarGrid — list view', () => {
  it('renders events grouped by day', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid
        events={testEvents}
        view="list"
        onViewChange={onChange}
        initialMonth={new Date(2026, 3, 1)}
      />
    )
    expect(screen.getByText('Check-out: Sruly')).toBeDefined()
    expect(screen.getByText('Check-out: Moshe')).toBeDefined()
    expect(screen.getByText('Check-in: Sara')).toBeDefined()
  })

  it('shows property names', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid
        events={testEvents}
        view="list"
        onViewChange={onChange}
        initialMonth={new Date(2026, 3, 1)}
      />
    )
    expect(screen.getAllByText(/Agripas 8/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Jerusalem Skyline/).length).toBeGreaterThan(0)
  })

  it('shows empty state when no events', () => {
    const onChange = vi.fn()
    render(
      <CalendarGrid events={[]} view="list" onViewChange={onChange} initialMonth={new Date(2026, 3, 1)} />
    )
    expect(screen.getByText('No events this month')).toBeDefined()
  })
})

describe('urgent events', () => {
  it('renders urgent indicator in list view', () => {
    const urgentOnly = testEvents.filter(e => e.urgent)
    const onChange = vi.fn()
    const { container } = render(
      <CalendarGrid
        events={urgentOnly}
        view="list"
        onViewChange={onChange}
        initialMonth={new Date(2026, 3, 1)}
      />
    )
    // TriangleAlert icon should be present
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })
})
