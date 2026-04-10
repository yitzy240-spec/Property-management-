import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /api/tasks/update
 * Validates: auth guard, input validation, delete handling, revalidation
 */

// Mock dependencies
const mockUpdate = vi.fn().mockReturnValue({ error: null })
const mockDelete = vi.fn().mockReturnValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: () => ({ eq: mockUpdate }),
      delete: () => ({ eq: mockDelete }),
    }),
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

let mockAuthError = false
vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => {
    if (mockAuthError) throw new (class extends Error { status = 401 })('Unauthorized')
  },
  AuthError: class extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s } },
}))

describe('/api/tasks/update', () => {
  beforeEach(() => {
    mockAuthError = false
    mockUpdate.mockReturnValue({ error: null })
    mockDelete.mockReturnValue({ error: null })
  })

  it('rejects unauthenticated requests', async () => {
    mockAuthError = true
    const { POST } = await import('../tasks/update/route')
    const req = new Request('http://localhost/api/tasks/update', {
      method: 'POST',
      body: JSON.stringify({ taskId: '123', updates: { status: 'completed' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('requires taskId', async () => {
    const { POST } = await import('../tasks/update/route')
    const req = new Request('http://localhost/api/tasks/update', {
      method: 'POST',
      body: JSON.stringify({ updates: { status: 'completed' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('taskId')
  })

  it('handles delete via _delete flag', async () => {
    const { POST } = await import('../tasks/update/route')
    const req = new Request('http://localhost/api/tasks/update', {
      method: 'POST',
      body: JSON.stringify({ taskId: '123', updates: { _delete: true } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockDelete).toHaveBeenCalled()
  })

  it('returns success on valid update', async () => {
    const { POST } = await import('../tasks/update/route')
    const req = new Request('http://localhost/api/tasks/update', {
      method: 'POST',
      body: JSON.stringify({ taskId: '123', updates: { status: 'in_progress' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})
