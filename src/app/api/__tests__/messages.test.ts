import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /api/messages
 * Validates: auth guard, input validation, message creation
 */

const mockInsert = vi.fn().mockReturnValue({
  select: () => ({
    single: () => ({ data: { id: 'msg-1', body: 'test', sender_role: 'admin', created_at: new Date().toISOString() }, error: null }),
  }),
})
const mockUpdate = vi.fn().mockReturnValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'messages') return {
        select: () => ({
          eq: () => ({ order: () => ({ data: [], error: null }) }),
        }),
        insert: mockInsert,
        update: () => ({
          eq: () => ({ neq: () => ({ eq: mockUpdate }) }),
        }),
      }
      if (table === 'properties') return {
        select: () => ({ eq: () => ({ single: () => ({ data: { name: 'Test', owner_id: null } }) }) }),
      }
      return { select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) }
    },
  }),
}))

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  escapeHtml: (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(),
  notifyAdmins: vi.fn(),
}))

let mockUser: { id: string; app_metadata?: Record<string, unknown> } | null = { id: 'user-1', app_metadata: { role: 'admin' } }
vi.mock('@/lib/auth', () => ({
  requireAuth: async () => {
    if (!mockUser) throw new (class extends Error { status = 401 })('Unauthorized')
    return mockUser
  },
  AuthError: class extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s } },
}))

describe('/api/messages', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1', app_metadata: { role: 'admin' } }
  })

  it('GET requires property_id parameter', async () => {
    const { GET } = await import('../messages/route')
    const req = new Request('http://localhost/api/messages')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('POST requires property_id and body', async () => {
    const { POST } = await import('../messages/route')
    const req = new Request('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'prop-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST rejects unauthenticated requests', async () => {
    mockUser = null
    const { POST } = await import('../messages/route')
    const req = new Request('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'prop-1', body: 'hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
