import { describe, it, expect } from 'vitest'
import { computeChecklistUpdate } from '@/lib/checklist-update'

/**
 * Tests for checklist update logic
 * Validates: idempotency of setting the same value twice
 */

describe('Checklist update logic', () => {
  it('produces identical updates when setting true twice', () => {
    const update1 = computeChecklistUpdate(true)
    const update2 = computeChecklistUpdate(true)
    
    expect(update1.is_completed).toBe(true)
    expect(update2.is_completed).toBe(true)
    expect(update1.is_completed).toBe(update2.is_completed)
    
    expect(update1.completed_at).not.toBeNull()
    expect(update2.completed_at).not.toBeNull()
  })

  it('produces identical updates when setting false twice', () => {
    const update1 = computeChecklistUpdate(false)
    const update2 = computeChecklistUpdate(false)
    
    expect(update1.is_completed).toBe(false)
    expect(update2.is_completed).toBe(false)
    expect(update1.is_completed).toBe(update2.is_completed)
    
    expect(update1.completed_at).toBeNull()
    expect(update2.completed_at).toBeNull()
  })

  it('sets completed_at to ISO timestamp when true', () => {
    const update = computeChecklistUpdate(true)
    
    expect(update.is_completed).toBe(true)
    expect(update.completed_at).not.toBeNull()
    expect(typeof update.completed_at).toBe('string')
    
    const timestamp = new Date(update.completed_at!)
    expect(timestamp.getTime()).toBeGreaterThan(0)
  })

  it('sets completed_at to null when false', () => {
    const update = computeChecklistUpdate(false)
    
    expect(update.is_completed).toBe(false)
    expect(update.completed_at).toBeNull()
  })

  it('is idempotent when toggling true → false → true', () => {
    const update1 = computeChecklistUpdate(true)
    expect(update1.is_completed).toBe(true)
    expect(update1.completed_at).not.toBeNull()

    const update2 = computeChecklistUpdate(false)
    expect(update2.is_completed).toBe(false)
    expect(update2.completed_at).toBeNull()

    const update3 = computeChecklistUpdate(true)
    expect(update3.is_completed).toBe(true)
    expect(update3.completed_at).not.toBeNull()
  })
})
