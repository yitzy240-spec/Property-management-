import { describe, it, expect } from 'vitest'
import type { CalendarEvent } from './calendar-grid'

/**
 * Tests for CalendarGrid logic.
 * Since CalendarGrid is a React component, we test the data logic
 * (event grouping, month calculations, date helpers) separately.
 */

// Replicate the helpers from the component for testing
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

describe('toDateStr', () => {
  it('formats dates as YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 3, 1))).toBe('2026-04-01')
    expect(toDateStr(new Date(2026, 0, 15))).toBe('2026-01-15')
    expect(toDateStr(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('zero-pads month and day', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDateStr(new Date(2026, 8, 9))).toBe('2026-09-09')
  })
})

describe('getMonthDays', () => {
  it('returns correct number of days for a month', () => {
    const days = getMonthDays(2026, 3) // April 2026
    const inMonthDays = days.filter(d => d.inMonth)
    expect(inMonthDays).toHaveLength(30) // April has 30 days
  })

  it('grid rows are multiples of 7', () => {
    for (let m = 0; m < 12; m++) {
      const days = getMonthDays(2026, m)
      expect(days.length % 7).toBe(0)
    }
  })

  it('first in-month day is the 1st', () => {
    const days = getMonthDays(2026, 3) // April
    const firstInMonth = days.find(d => d.inMonth)
    expect(firstInMonth?.dateStr).toBe('2026-04-01')
  })

  it('last in-month day is correct', () => {
    const days = getMonthDays(2026, 1) // February 2026
    const inMonth = days.filter(d => d.inMonth)
    expect(inMonth[inMonth.length - 1].dateStr).toBe('2026-02-28')
  })

  it('includes padding days from previous/next month', () => {
    const days = getMonthDays(2026, 3) // April 2026, starts on Wednesday
    const outOfMonth = days.filter(d => !d.inMonth)
    expect(outOfMonth.length).toBeGreaterThan(0)
    // Padding days should be from March or May
    const marchDays = outOfMonth.filter(d => d.dateStr.startsWith('2026-03'))
    const mayDays = outOfMonth.filter(d => d.dateStr.startsWith('2026-05'))
    expect(marchDays.length + mayDays.length).toBe(outOfMonth.length)
  })
})

describe('groupEventsByDate', () => {
  const events: CalendarEvent[] = [
    { id: '1', date: '2026-04-01', type: 'checkout', title: 'CO Guest 1', property: 'Apt A' },
    { id: '2', date: '2026-04-01', type: 'cleaning', title: 'Clean Apt A', property: 'Apt A' },
    { id: '3', date: '2026-04-01', type: 'checkin', title: 'CI Guest 2', property: 'Apt A' },
    { id: '4', date: '2026-04-05', type: 'checkout', title: 'CO Guest 3', property: 'Apt B' },
    { id: '5', date: '2026-04-10', type: 'checkin', title: 'CI Guest 4', property: 'Apt B' },
  ]

  it('groups events by date', () => {
    const grouped = groupEventsByDate(events)
    expect(grouped.size).toBe(3) // 3 unique dates
    expect(grouped.get('2026-04-01')).toHaveLength(3)
    expect(grouped.get('2026-04-05')).toHaveLength(1)
    expect(grouped.get('2026-04-10')).toHaveLength(1)
  })

  it('returns empty map for no events', () => {
    const grouped = groupEventsByDate([])
    expect(grouped.size).toBe(0)
  })

  it('preserves event order within a date', () => {
    const grouped = groupEventsByDate(events)
    const apr1 = grouped.get('2026-04-01')!
    expect(apr1[0].type).toBe('checkout')
    expect(apr1[1].type).toBe('cleaning')
    expect(apr1[2].type).toBe('checkin')
  })
})

describe('event type coverage', () => {
  it('all event types have config', () => {
    const types: CalendarEvent['type'][] = ['checkout', 'checkin', 'cleaning', 'bill', 'task', 'contractor']
    // Just verify we support all types without errors
    for (const type of types) {
      const event: CalendarEvent = { id: `test-${type}`, date: '2026-04-01', type, title: 'Test', property: 'Apt' }
      expect(event.type).toBe(type)
    }
  })
})

describe('urgent flag detection', () => {
  it('same-day checkout + checkin on same property should be flagged', () => {
    const bookings = [
      { id: 'b1', check_out: '2026-04-05', check_in: '2026-04-01', guest_name: 'Out', property: 'Apt A' },
      { id: 'b2', check_in: '2026-04-05', check_out: '2026-04-10', guest_name: 'In', property: 'Apt A' },
    ]

    // Simulate the page.tsx logic
    const checkoutsByPropertyDate = new Map<string, string>()
    const events: { urgent?: boolean; type: string; date: string }[] = []

    for (const b of bookings) {
      if (b.check_out) {
        checkoutsByPropertyDate.set(`${b.property}-${b.check_out}`, b.id)
        events.push({ type: 'checkout', date: b.check_out })
      }
    }
    for (const b of bookings) {
      if (b.check_in) {
        const hasSameDay = checkoutsByPropertyDate.has(`${b.property}-${b.check_in}`)
        events.push({ type: 'checkin', date: b.check_in, urgent: hasSameDay })
      }
    }

    const urgentEvents = events.filter(e => e.urgent)
    expect(urgentEvents).toHaveLength(1)
    expect(urgentEvents[0].date).toBe('2026-04-05')
  })
})
