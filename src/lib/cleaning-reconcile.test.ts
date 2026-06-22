import { describe, it, expect } from 'vitest'
import { findOrphanCleaningTaskIds } from './cleaning-reconcile'

describe('findOrphanCleaningTaskIds', () => {
  const A = 'prop-a'
  const B = 'prop-b'

  it('keeps a cleaning task that matches a live checkout', () => {
    const live = [{ property_id: A, check_out: '2026-06-24' }]
    const tasks = [{ id: 't1', property_id: A, due_date: '2026-06-24' }]
    expect(findOrphanCleaningTaskIds(live, tasks)).toEqual([])
  })

  it('flags a cleaning task whose checkout date moved (the reported bug)', () => {
    // Booking moved from 06-27 to 06-24: new task at 24 is valid, old 27 is orphaned.
    const live = [{ property_id: A, check_out: '2026-06-24' }]
    const tasks = [
      { id: 'keep', property_id: A, due_date: '2026-06-24' },
      { id: 'orphan', property_id: A, due_date: '2026-06-27' },
    ]
    expect(findOrphanCleaningTaskIds(live, tasks)).toEqual(['orphan'])
  })

  it('flags a cleaning task for a cancelled booking (no live checkout at all)', () => {
    const live: { property_id: string; check_out: string | null }[] = []
    const tasks = [{ id: 'orphan', property_id: A, due_date: '2026-06-27' }]
    expect(findOrphanCleaningTaskIds(live, tasks)).toEqual(['orphan'])
  })

  it('matches per-property: same date on a different property is not a match', () => {
    const live = [{ property_id: B, check_out: '2026-06-27' }]
    const tasks = [{ id: 'orphan', property_id: A, due_date: '2026-06-27' }]
    expect(findOrphanCleaningTaskIds(live, tasks)).toEqual(['orphan'])
  })

  it('ignores tasks and checkouts with null dates', () => {
    const live = [
      { property_id: A, check_out: null },
      { property_id: A, check_out: '2026-06-24' },
    ]
    const tasks = [
      { id: 'no-date', property_id: A, due_date: null },
      { id: 'valid', property_id: A, due_date: '2026-06-24' },
    ]
    expect(findOrphanCleaningTaskIds(live, tasks)).toEqual([])
  })
})
