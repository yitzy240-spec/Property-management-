import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /api/properties/utility-accounts
 * Validates: admin auth guard + correct UPDATE/DELETE payloads.
 */

const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: (data: Record<string, unknown>) => {
        mockUpdate(data)
        return { eq: mockUpdateEq }
      },
      delete: () => {
        mockDelete()
        return { eq: mockDeleteEq }
      },
    }),
  }),
}))

let mockAuthError = false
class MockAuthError extends Error {
  status: number
  constructor(m: string, s: number) {
    super(m)
    this.name = 'AuthError'
    this.status = s
  }
}
vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => {
    if (mockAuthError) throw new MockAuthError('Admin access required', 403)
  },
  AuthError: MockAuthError,
}))

describe('PATCH /api/properties/utility-accounts (updateUtilityAccount)', () => {
  beforeEach(() => {
    mockAuthError = false
    mockUpdate.mockReset()
    mockUpdateEq.mockReset().mockResolvedValue({ error: null })
  })

  it('rejects non-admin requests', async () => {
    mockAuthError = true
    const { PATCH } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'acc-1', notes: 'tenant id 12345' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects requests missing id', async () => {
    const { PATCH } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts', {
      method: 'PATCH',
      body: JSON.stringify({ notes: 'oops no id' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('writes only whitelisted fields', async () => {
    const { PATCH } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts', {
      method: 'PATCH',
      body: JSON.stringify({
        id: 'acc-1',
        notes: 'Tenant ID 305123456',
        account_number: '999',
        utility_type: 'water',
        label: 'KH #26',
        // Unsafe / ignored fields:
        property_id: 'sneaky',
        created_at: '1999-01-01',
      }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload).toEqual({
      notes: 'Tenant ID 305123456',
      account_number: '999',
      utility_type: 'water',
      label: 'KH #26',
    })
    expect(payload.property_id).toBeUndefined()
    expect(payload.created_at).toBeUndefined()
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'acc-1')
  })

  it('rejects requests with no editable fields', async () => {
    const { PATCH } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'acc-1', property_id: 'sneaky' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 500 when supabase update fails', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: { message: 'DB exploded' } })
    const { PATCH } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'acc-1', notes: 'x' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/properties/utility-accounts (deleteUtilityAccount)', () => {
  beforeEach(() => {
    mockAuthError = false
    mockDelete.mockReset()
    mockDeleteEq.mockReset().mockResolvedValue({ error: null })
  })

  it('rejects non-admin requests', async () => {
    mockAuthError = true
    const { DELETE } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts?id=acc-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req)
    expect(res.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects requests missing id', async () => {
    const { DELETE } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts', {
      method: 'DELETE',
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes the account by id', async () => {
    const { DELETE } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts?id=acc-42', {
      method: 'DELETE',
    })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'acc-42')
  })

  it('returns 500 when supabase delete fails', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: { message: 'cannot delete' } })
    const { DELETE } = await import('../properties/utility-accounts/route')
    const req = new Request('http://localhost/api/properties/utility-accounts?id=acc-42', {
      method: 'DELETE',
    })
    const res = await DELETE(req)
    expect(res.status).toBe(500)
  })
})
