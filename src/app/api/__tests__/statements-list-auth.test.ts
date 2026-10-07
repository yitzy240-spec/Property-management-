import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/statements must pin non-admins to their own owner_id.
 * Regression: an owner could set the impersonation cookie themselves and
 * receive every owner's statements (service-role client, no owner filter).
 */

let mockUser: Record<string, unknown> | null = null
let mockCookie: string | undefined
let mockEffectiveOwnerId: string | null = null
const eqCalls: Array<[string, unknown]> = []
const notCalls: Array<[string, string, unknown]> = []

function chain() {
  const c: Record<string, unknown> = {}
  c.select = () => c
  c.order = () => c
  c.eq = (col: string, val: unknown) => { eqCalls.push([col, val]); return c }
  c.not = (col: string, op: string, val: unknown) => { notCalls.push([col, op, val]); return c }
  c.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
  createServiceClient: () => ({ from: () => chain() }),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => (mockCookie ? { value: mockCookie } : undefined) }),
}))

vi.mock('@/lib/impersonation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/impersonation')>('@/lib/impersonation')
  return { ...actual, getEffectiveOwnerId: async () => ({ ownerId: mockEffectiveOwnerId }) }
})

async function callGet(query = '') {
  const { GET } = await import('../statements/route')
  return GET(new Request(`http://localhost/api/statements${query}`))
}

describe('GET /api/statements authorization', () => {
  beforeEach(() => {
    eqCalls.length = 0
    notCalls.length = 0
    mockCookie = undefined
    mockEffectiveOwnerId = null
  })

  it('rejects logged-out callers', async () => {
    mockUser = null
    const res = await callGet()
    expect(res.status).toBe(401)
  })

  it('pins an owner with a forged impersonation cookie to their own owner_id', async () => {
    mockUser = { id: 'u-owner', app_metadata: { role: 'owner' } }
    mockCookie = 'someone-elses-owner-id'
    mockEffectiveOwnerId = 'own-owner-id'
    await callGet('?owner_id=someone-elses-owner-id')
    expect(eqCalls).toContainEqual(['owner_id', 'own-owner-id'])
    expect(eqCalls).not.toContainEqual(['owner_id', 'someone-elses-owner-id'])
    expect(notCalls.length).toBe(1) // drafts hidden
  })

  it('returns nothing for a logged-in user with no owner record', async () => {
    mockUser = { id: 'u-x', app_metadata: {} }
    mockEffectiveOwnerId = null
    const res = await callGet()
    expect(await res.json()).toEqual({ statements: [] })
    expect(eqCalls).toEqual([])
  })

  it('lets an admin list any owner, drafts included', async () => {
    mockUser = { id: 'u-admin', app_metadata: { role: 'admin' } }
    await callGet('?owner_id=o-1')
    expect(eqCalls).toContainEqual(['owner_id', 'o-1'])
    expect(notCalls).toEqual([])
  })
})
