import { describe, test, expect } from 'vitest'
import { isWithinVisitEditWindow, serializeVisitForViewer } from '@/lib/visits'

describe('Visit edit 24h boundary enforcement', () => {
  test('visit created 23h59min ago can be edited', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T12:01:00Z') // 23h59min ago
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(true)
  })

  test('visit created exactly 24h ago cannot be edited (403)', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T12:00:00Z') // exactly 24h ago
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(false)
  })

  test('visit created 24h01min ago cannot be edited (403)', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T11:59:00Z') // 24h01min ago
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(false)
  })

  test('visit created 25h ago cannot be edited', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T11:00:00Z') // 25h ago
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(false)
  })
})

describe('Visit detail - owner permissions', () => {
  const visit = {
    id: 'visit-1',
    property_id: 'prop-1',
    visited_at: '2026-11-17',
    checklist: { electricity_working: true },
    note: 'All good',
    admin_note: 'Admin only: needs follow-up',
    created_by: 'admin-1',
    created_at: '2026-11-17T10:00:00Z',
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

  test('owner response never includes admin_note', () => {
    const result = serializeVisitForViewer(visit, [], false)
    expect(result.admin_note).toBeNull()
    expect(result.note).toBe('All good')
  })

  test('admin response includes admin_note', () => {
    const result = serializeVisitForViewer(visit, [], true)
    expect(result.admin_note).toBe('Admin only: needs follow-up')
  })

  test('owner response never includes private media (is_private=true)', () => {
    const result = serializeVisitForViewer(visit, [publicMedia, privateMedia], false)
    expect(result.media).toHaveLength(1)
    expect(result.media[0].id).toBe('media-1')
    expect(result.media[0].is_private).toBe(false)
  })

  test('admin response includes all media including private', () => {
    const result = serializeVisitForViewer(visit, [publicMedia, privateMedia], true)
    expect(result.media).toHaveLength(2)
    const mediaIds = result.media.map((m: any) => m.id)
    expect(mediaIds).toContain('media-1')
    expect(mediaIds).toContain('media-2')
  })

  test('owner sees empty media array when all media is private', () => {
    const result = serializeVisitForViewer(visit, [privateMedia], false)
    expect(result.media).toHaveLength(0)
  })

  test('owner sees all media when none are private', () => {
    const result = serializeVisitForViewer(visit, [publicMedia], false)
    expect(result.media).toHaveLength(1)
    expect(result.media[0].id).toBe('media-1')
  })
})

describe('Visit media upload/delete within 24h', () => {
  test('media can be added within 23h59min', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T12:01:00Z')
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(true)
  })

  test('media upload returns 403 at exactly 24h', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T12:00:00Z')
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(false)
  })

  test('media deletion returns 403 after 24h', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const createdAt = new Date('2026-11-16T11:00:00Z')
    expect(isWithinVisitEditWindow(createdAt, now)).toBe(false)
  })
})

describe('Non-admin permissions', () => {
  test('non-admin cannot see admin_note field', () => {
    const visit = {
      id: 'v1',
      property_id: 'p1',
      visited_at: '2026-11-17',
      checklist: {},
      note: 'Public note',
      admin_note: 'Secret admin note',
      created_by: 'admin',
      created_at: '2026-11-17T10:00:00Z',
    }
    const result = serializeVisitForViewer(visit, [], false)
    expect(result.admin_note).toBeNull()
    expect(result.note).toBe('Public note')
  })

  test('non-admin cannot see is_private=true media', () => {
    const visit = {
      id: 'v1',
      property_id: 'p1',
      visited_at: '2026-11-17',
      checklist: {},
      note: 'Test',
      admin_note: null,
      created_by: 'admin',
      created_at: '2026-11-17T10:00:00Z',
    }
    const media = [
      { id: 'm1', file_path: 'p1.jpg', file_type: 'image' as const, is_private: false, signed_url: 'url1' },
      { id: 'm2', file_path: 'p2.jpg', file_type: 'image' as const, is_private: true, signed_url: 'url2' },
    ]
    const result = serializeVisitForViewer(visit, media, false)
    expect(result.media).toHaveLength(1)
    expect(result.media[0].id).toBe('m1')
  })
})
