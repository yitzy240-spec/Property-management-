import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /api/messages
 * Validates: auth guard, input validation, message creation, impersonation gate
 */

// Mock next/headers cookies() — let each test toggle the impersonation cookie.
let mockCookieValue: string | null = null
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) =>
      name === 'impersonate_owner_id' && mockCookieValue
        ? { value: mockCookieValue }
        : undefined,
  }),
}))

const mockInsert = vi.fn().mockReturnValue({
  select: () => ({
    single: () => ({ data: { id: 'msg-1', body: 'test', sender_role: 'admin', created_at: new Date().toISOString() }, error: null }),
  }),
})
const mockUpdate = vi.fn().mockReturnValue({ error: null })
// auth_user_id of the owner of the property being messaged about
let mockPropertyOwnerAuthId: string | null = null

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
        select: () => ({ eq: () => ({ single: () => ({ data: { name: 'Test', owner_id: 'o-1', owners: { auth_user_id: mockPropertyOwnerAuthId } } }) }) }),
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
    mockCookieValue = null
    mockPropertyOwnerAuthId = null
    mockInsert.mockClear()
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

  it('POST returns 403 when admin is impersonating an owner', async () => {
    // Admin authenticated, but impersonation cookie present → mutation blocked.
    // Without this gate, an admin in "view as owner" mode could curl the
    // endpoint and write a message attributed to the impersonated owner.
    mockUser = { id: 'admin-1', app_metadata: { role: 'admin' } }
    mockCookieValue = 'owner-target-1'
    const { POST } = await import('../messages/route')
    const req = new Request('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'prop-1', body: 'hello', sender_role: 'owner' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/read-only|impersonation/i)
  })

  // Regression: any logged-in owner could read/post in every property's thread
  // and post with a client-chosen sender_role of "admin".
  it("GET forbids an owner from reading another owner's thread", async () => {
    mockUser = { id: 'owner-user', app_metadata: { role: 'owner' } }
    mockPropertyOwnerAuthId = 'someone-else'
    const { GET } = await import('../messages/route')
    const res = await GET(new Request('http://localhost/api/messages?property_id=prop-1'))
    expect(res.status).toBe(403)
  })

  it("POST forbids an owner from posting in another owner's thread", async () => {
    mockUser = { id: 'owner-user', app_metadata: { role: 'owner' } }
    mockPropertyOwnerAuthId = 'someone-else'
    const { POST } = await import('../messages/route')
    const res = await POST(new Request('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'prop-1', body: 'hello', sender_role: 'admin' }),
    }))
    expect(res.status).toBe(403)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('POST ignores a client-supplied sender_role — an owner always posts as owner', async () => {
    mockUser = { id: 'owner-user', app_metadata: { role: 'owner' } }
    mockPropertyOwnerAuthId = 'owner-user'
    const { POST } = await import('../messages/route')
    const res = await POST(new Request('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'prop-1', body: 'hello', sender_role: 'admin' }),
    }))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ sender_role: 'owner' }))
  })
})
