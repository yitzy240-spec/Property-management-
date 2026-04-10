import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /api/contractor/complete
 * Validates: token verification, task completion, expense bill creation, notification
 */

let mockTokenValid = true
vi.mock('@/lib/magic-links', () => ({
  verifyAndCheckMagicLink: async () => {
    if (!mockTokenValid) throw new Error('Invalid token')
    return { property_id: 'prop-1', task_id: 'task-1', magic_link_id: 'ml-1' }
  },
}))

const mockTaskUpdate = vi.fn().mockReturnValue({ error: null })
const mockBillInsert = vi.fn().mockReturnValue({ error: null })
const mockLinkUpdate = vi.fn().mockReturnValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'tasks') return {
        select: () => ({
          eq: () => ({
            single: () => ({ data: { title: 'Clean', property_id: 'prop-1', properties: { name: 'Agripas 6' } } }),
          }),
        }),
        update: () => ({ eq: mockTaskUpdate }),
      }
      if (table === 'bills') return { insert: mockBillInsert }
      if (table === 'magic_links') return { update: () => ({ eq: mockLinkUpdate }) }
      return { from: () => ({}) }
    },
  }),
}))

vi.mock('@/lib/notifications', () => ({
  notifyAdmins: vi.fn(),
}))

describe('/api/contractor/complete', () => {
  beforeEach(() => {
    mockTokenValid = true
    mockTaskUpdate.mockReturnValue({ error: null })
    mockBillInsert.mockReturnValue({ error: null })
    mockLinkUpdate.mockReturnValue({ error: null })
  })

  it('rejects invalid token', async () => {
    mockTokenValid = false
    const { POST } = await import('../contractor/complete/route')
    const req = new Request('http://localhost/api/contractor/complete', {
      method: 'POST',
      body: JSON.stringify({ token: 'bad-token', task_id: 'task-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('completes task and marks magic link as used', async () => {
    const { POST } = await import('../contractor/complete/route')
    const req = new Request('http://localhost/api/contractor/complete', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid', task_id: 'task-1', expense_agorot: 0 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockTaskUpdate).toHaveBeenCalled()
    expect(mockLinkUpdate).toHaveBeenCalled()
  })

  it('creates expense bill when expense > 0', async () => {
    const { POST } = await import('../contractor/complete/route')
    const req = new Request('http://localhost/api/contractor/complete', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid', task_id: 'task-1', expense_agorot: 30000 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockBillInsert).toHaveBeenCalled()
  })

  it('does not create bill when expense is 0', async () => {
    mockBillInsert.mockClear()
    const { POST } = await import('../contractor/complete/route')
    const req = new Request('http://localhost/api/contractor/complete', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid', task_id: 'task-1', expense_agorot: 0 }),
    })
    await POST(req)
    expect(mockBillInsert).not.toHaveBeenCalled()
  })
})
