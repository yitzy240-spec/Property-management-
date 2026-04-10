import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /api/bills/add
 * Validates: auth guard, bill insertion via service client
 */

const mockInsert = vi.fn().mockReturnValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({ insert: mockInsert }),
  }),
}))

let mockAuthError = false
vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => {
    if (mockAuthError) throw new (class extends Error { status = 401 })('Unauthorized')
  },
  AuthError: class extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s } },
}))

describe('/api/bills/add', () => {
  beforeEach(() => {
    mockAuthError = false
    mockInsert.mockReturnValue({ error: null })
  })

  it('rejects unauthenticated requests', async () => {
    mockAuthError = true
    const { POST } = await import('../bills/add/route')
    const req = new Request('http://localhost/api/bills/add', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'p1', bill_type: 'iec', amount_agorot: 50000 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('creates bill via service client', async () => {
    const { POST } = await import('../bills/add/route')
    const billData = {
      property_id: 'prop-1',
      bill_type: 'iec',
      amount_agorot: 50000,
      status: 'approved',
    }
    const req = new Request('http://localhost/api/bills/add', {
      method: 'POST',
      body: JSON.stringify(billData),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith(billData)
  })

  it('returns error when insert fails', async () => {
    mockInsert.mockReturnValue({ error: { message: 'Insert failed' } })
    const { POST } = await import('../bills/add/route')
    const req = new Request('http://localhost/api/bills/add', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'p1', bill_type: 'gas', amount_agorot: 1000 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
