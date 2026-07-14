import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for updateBillStatus server action — ensures `edits` are merged
 * into the UPDATE in the same call as status + payment_method.
 */

// ── Mocks ──

const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockUpsert = vi.fn().mockResolvedValue({ error: null })
const mockLimit = vi.fn()
const mockRevalidatePath = vi.fn()

/**
 * Build a chainable query builder. Most chain methods return `this`;
 * terminal methods (`single`, `limit`) resolve to mocked data.
 *
 * Real call chains used by updateBillStatus:
 *   - bills.select('...').eq('id', billId).single()  → fetch bill row
 *   - bills.update({...}).eq('id', billId)           → update
 *   - bills.select('created_at').eq().eq().eq().neq().order().limit() → prev bills
 */
function makeQuery() {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.neq = () => q
  q.order = () => q
  q.single = mockSingle
  q.limit = mockLimit
  return q
}

function makeFrom() {
  return (table: string) => {
    if (table === 'properties') {
      return {
        update: (data: Record<string, unknown>) => {
          mockUpdate(data)
          return { eq: mockEq }
        },
      }
    }
    if (table === 'bills') {
      const q = makeQuery()
      ;(q as Record<string, unknown>).update = (data: Record<string, unknown>) => {
        mockUpdate(data)
        return { eq: mockEq }
      }
      return q
    }
    if (table === 'bill_schedules') {
      return { upsert: mockUpsert }
    }
    return {}
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-1' } } }),
    },
  }),
  createServiceClient: () => ({
    from: makeFrom(),
  }),
}))

// `revalidatePath` requires Next's static-generation store, which doesn't
// exist outside a request — stub it so the action can run in unit tests.
vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

describe('updateProperty', () => {
  beforeEach(() => {
    mockEq.mockReset().mockResolvedValue({ error: null })
    mockRevalidatePath.mockReset()
  })

  it('invalidates the edit page so it reloads the complete saved guest-link list', async () => {
    const { updateProperty } = await import('./actions')

    await updateProperty('property-1', {
      guest_links: [
        { label: 'Fridge', url: 'https://example.com/fridge', hide_until_revealed: false },
        { label: 'Garbage', url: 'https://example.com/garbage', hide_until_revealed: false },
        { label: 'Shabbat code', url: 'https://example.com/code', hide_until_revealed: false },
      ],
    })

    expect(mockRevalidatePath).toHaveBeenCalledWith('/properties/property-1/edit')
  })
})

describe('updateBillStatus', () => {
  beforeEach(() => {
    mockUpdate.mockReset()
    mockEq.mockReset().mockResolvedValue({ error: null })
    mockSingle.mockResolvedValue({
      data: {
        property_id: 'old-prop',
        bill_type: 'iec',
        created_at: '2026-04-01T00:00:00Z',
      },
    })
    mockLimit.mockResolvedValue({ data: [] })
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('sets status + approved_at + approved_by, no edits', async () => {
    const { updateBillStatus } = await import('./actions')
    const result = await updateBillStatus('bill-1', 'approved', 'paid_by_admin')
    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = mockUpdate.mock.calls[0][0]
    expect(updatePayload.status).toBe('approved')
    expect(updatePayload.approved_by).toBe('admin-1')
    expect(updatePayload.payment_method).toBe('paid_by_admin')
    expect(typeof updatePayload.approved_at).toBe('string')
    // No edit fields should be present
    expect(updatePayload.amount_agorot).toBeUndefined()
    expect(updatePayload.bill_type).toBeUndefined()
    expect(updatePayload.property_id).toBeUndefined()
  })

  it('merges edits into the same UPDATE as status + payment_method', async () => {
    const { updateBillStatus } = await import('./actions')
    await updateBillStatus('bill-1', 'approved', 'paid_by_owner_cash', {
      amount_agorot: 99900,
      due_date: '2026-05-15',
      bill_type: 'water',
      property_id: 'new-prop',
      period_start: '2026-04-01',
      period_end: '2026-04-30',
    })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.status).toBe('approved')
    expect(payload.payment_method).toBe('paid_by_owner_cash')
    expect(payload.amount_agorot).toBe(99900)
    expect(payload.due_date).toBe('2026-05-15')
    expect(payload.bill_type).toBe('water')
    expect(payload.property_id).toBe('new-prop')
    expect(payload.billing_period_start).toBe('2026-04-01')
    expect(payload.billing_period_end).toBe('2026-04-30')
  })

  it('handles partial edits — only specified fields are written', async () => {
    const { updateBillStatus } = await import('./actions')
    await updateBillStatus('bill-1', 'approved', 'paid_by_admin', {
      amount_agorot: 50000,
    })
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.amount_agorot).toBe(50000)
    expect(payload.bill_type).toBeUndefined()
    expect(payload.property_id).toBeUndefined()
    expect(payload.due_date).toBeUndefined()
  })

  it('handles rejection without payment_method', async () => {
    const { updateBillStatus } = await import('./actions')
    await updateBillStatus('bill-1', 'rejected', undefined, {
      amount_agorot: 12345,
    })
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.status).toBe('rejected')
    expect(payload.approved_at).toBeNull()
    expect(payload.payment_method).toBeUndefined()
    expect(payload.amount_agorot).toBe(12345)
  })

  it('clears approved_by on rejection (mirrors approved_at)', async () => {
    const { updateBillStatus } = await import('./actions')
    await updateBillStatus('bill-1', 'rejected')
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.status).toBe('rejected')
    expect(payload.approved_at).toBeNull()
    expect(payload.approved_by).toBeNull()
  })

  it('treats null due_date as a valid edit (clears the date)', async () => {
    const { updateBillStatus } = await import('./actions')
    await updateBillStatus('bill-1', 'approved', 'paid_by_admin', {
      due_date: null,
    })
    const payload = mockUpdate.mock.calls[0][0]
    expect('due_date' in payload).toBe(true)
    expect(payload.due_date).toBeNull()
  })

  it('returns error message when supabase update fails', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'DB error' } })
    const { updateBillStatus } = await import('./actions')
    const result = await updateBillStatus('bill-1', 'approved', 'paid_by_admin')
    expect(result).toEqual({ error: 'DB error' })
  })
})
