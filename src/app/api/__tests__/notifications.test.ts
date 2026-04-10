import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /api/notifications
 * Validates: auth guard, listing, mark as read
 */

let mockUser: { id: string } | null = { id: 'user-1' }

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
  }),
  createServiceClient: () => ({
    from: () => ({
      select: (...args: unknown[]) => {
        // Check if it's a count query (head: true)
        if (typeof args[1] === 'object' && (args[1] as Record<string, unknown>)?.head) {
          return {
            eq: () => ({ eq: () => ({ count: 3 }) }),
          }
        }
        return {
          eq: () => ({
            order: () => ({ limit: () => ({ data: [
              { id: 'n1', title: 'Test', body: null, link: null, is_read: false, created_at: new Date().toISOString() },
            ] }) }),
          }),
        }
      },
      update: () => ({
        eq: () => ({ eq: () => ({ error: null }) }),
        in: () => ({ error: null }),
      }),
    }),
  }),
}))

describe('/api/notifications', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' }
  })

  it('GET returns notifications for authenticated user', async () => {
    const { GET } = await import('../notifications/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.notifications).toBeDefined()
    expect(Array.isArray(data.notifications)).toBe(true)
  })

  it('GET rejects unauthenticated', async () => {
    mockUser = null
    const { GET } = await import('../notifications/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('PATCH marks notifications as read', async () => {
    const { PATCH } = await import('../notifications/route')
    const req = new Request('http://localhost/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids: 'all' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})
