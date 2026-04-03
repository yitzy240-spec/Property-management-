import { describe, it, expect } from 'vitest'
import { parseICalFeed } from './ical-sync'

const SAMPLE_ICAL = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:booking-001@airbnb.com
DTSTART;VALUE=DATE:20260410
DTEND;VALUE=DATE:20260415
SUMMARY:Yael Cohen
END:VEVENT
BEGIN:VEVENT
UID:booking-002@airbnb.com
DTSTART;VALUE=DATE:20260420
DTEND;VALUE=DATE:20260425
SUMMARY:David Levy
END:VEVENT
END:VCALENDAR`

const EMPTY_ICAL = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
END:VCALENDAR`

describe('iCal Parser', () => {
  it('parses events from iCal feed', () => {
    const events = parseICalFeed(SAMPLE_ICAL)

    expect(events).toHaveLength(2)
    expect(events[0].uid).toBe('booking-001@airbnb.com')
    expect(events[0].summary).toBe('Yael Cohen')
    expect(events[0].dtstart).toBe('2026-04-10')
    expect(events[0].dtend).toBe('2026-04-15')
  })

  it('parses second event correctly', () => {
    const events = parseICalFeed(SAMPLE_ICAL)

    expect(events[1].uid).toBe('booking-002@airbnb.com')
    expect(events[1].summary).toBe('David Levy')
    expect(events[1].dtstart).toBe('2026-04-20')
    expect(events[1].dtend).toBe('2026-04-25')
  })

  it('handles empty calendar', () => {
    const events = parseICalFeed(EMPTY_ICAL)
    expect(events).toHaveLength(0)
  })

  it('extracts UIDs for deduplication', () => {
    const events = parseICalFeed(SAMPLE_ICAL)
    const uids = events.map(e => e.uid)

    expect(uids).toContain('booking-001@airbnb.com')
    expect(uids).toContain('booking-002@airbnb.com')
    // UIDs should be unique
    expect(new Set(uids).size).toBe(uids.length)
  })

  it('handles events without summary', () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:no-name@test.com
DTSTART;VALUE=DATE:20260501
DTEND;VALUE=DATE:20260503
END:VEVENT
END:VCALENDAR`

    const events = parseICalFeed(ical)
    expect(events).toHaveLength(1)
    expect(events[0].summary).toBeNull()
  })

  it('returns dates as YYYY-MM-DD strings', () => {
    const events = parseICalFeed(SAMPLE_ICAL)

    for (const event of events) {
      expect(event.dtstart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(event.dtend).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
