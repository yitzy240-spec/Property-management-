import { describe, test, expect } from 'vitest'
import { isWithinVisitEditWindow, serializeVisitForViewer } from './visits'

describe('isWithinVisitEditWindow', () => {
  test('returns true when exactly 23h59min have passed', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T12:01:00Z') // 23h59min ago
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(true)
  })

  test('returns false when exactly 24h have passed', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T12:00:00Z') // exactly 24h ago
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(false)
  })

  test('returns false when 24h01min have passed', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T11:59:00Z') // 24h01min ago
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(false)
  })

  test('returns true when 1 hour has passed', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-17T11:00:00Z')
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(true)
  })

  test('accepts Date objects', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-17T11:00:00Z')
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(true)
  })

  test('accepts ISO string dates', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = '2026-11-17T11:00:00Z'
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(true)
  })
})

describe('serializeVisitForViewer', () => {
  const baseVisit = {
    id: 'visit-1',
    property_id: 'prop-1',
    visited_at: '2026-11-17',
    checklist: { electricity_working: true },
    note: 'All good',
    admin_note: 'Private admin note',
    created_by: 'user-1',
    created_at: '2026-11-17T10:00:00Z',
    properties: { name: 'Test Property' },
  }

  const publicMedia = {
    id: 'media-1',
    file_path: 'public.jpg',
    file_type: 'image' as const,
    is_private: false,
    signed_url: 'https://example.com/public.jpg',
  }

  const privateMedia = {
    id: 'media-2',
    file_path: 'private.jpg',
    file_type: 'image' as const,
    is_private: true,
    signed_url: 'https://example.com/private.jpg',
  }

  test('admin sees admin_note', () => {
    const result = serializeVisitForViewer(baseVisit, [], true)
    expect(result.admin_note).toBe('Private admin note')
  })

  test('non-admin does not see admin_note (null)', () => {
    const result = serializeVisitForViewer(baseVisit, [], false)
    expect(result.admin_note).toBeNull()
  })

  test('admin sees all media including private', () => {
    const result = serializeVisitForViewer(baseVisit, [publicMedia, privateMedia], true)
    expect(result.media).toHaveLength(2)
    expect(result.media).toContainEqual(publicMedia)
    expect(result.media).toContainEqual(privateMedia)
  })

  test('non-admin only sees public media (is_private filtered out)', () => {
    const result = serializeVisitForViewer(baseVisit, [publicMedia, privateMedia], false)
    expect(result.media).toHaveLength(1)
    expect(result.media[0]).toEqual(publicMedia)
  })

  test('non-admin sees empty array when all media is private', () => {
    const result = serializeVisitForViewer(baseVisit, [privateMedia], false)
    expect(result.media).toHaveLength(0)
  })

  test('preserves all other visit fields', () => {
    const result = serializeVisitForViewer(baseVisit, [], true)
    expect(result.id).toBe('visit-1')
    expect(result.property_id).toBe('prop-1')
    expect(result.note).toBe('All good')
    expect(result.checklist).toEqual({ electricity_working: true })
  })
})
