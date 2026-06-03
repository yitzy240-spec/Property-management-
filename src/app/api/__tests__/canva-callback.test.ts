import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /api/auth/canva/callback
 *
 * Regression: the callback is a cross-site redirect back from canva.com. The
 * Supabase session cookie is not reliably present/refreshed on that hop
 * (middleware — which refreshes the token — explicitly excludes /api/auth/*).
 * So the callback must authenticate the flow via the `canva_oauth_state`
 * cookie (Lax, set during the authenticated start request), NOT via a live
 * requireAdmin() session check. These tests simulate "no live session" and
 * assert the roundtrip still completes when state matches, and is rejected
 * when it doesn't.
 */

const exchangeMock = vi.fn(async () => ({
  access_token: 'a-token',
  refresh_token: 'r-token',
  expires_at: '2026-01-01T00:00:00.000Z',
}))
const storeMock = vi.fn(async () => {})

let stateCookie: string | undefined = 'STATE123'
let verifierCookie: string | undefined = 'VERIFIER123'

vi.mock('@/lib/canva', () => ({
  exchangeCodeForTokens: (...args: unknown[]) => exchangeMock(...(args as [])),
  storeCanvaTokens: (...args: unknown[]) => storeMock(...(args as [])),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => {
      if (name === 'canva_oauth_state') return stateCookie ? { value: stateCookie } : undefined
      if (name === 'canva_code_verifier') return verifierCookie ? { value: verifierCookie } : undefined
      return undefined
    },
  }),
}))

// Simulate the cross-site callback: no live session available.
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))

function callbackRequest(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  return new Request(`https://app.marcus-properties.com/api/auth/canva/callback?${qs}`)
}

describe('/api/auth/canva/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateCookie = 'STATE123'
    verifierCookie = 'VERIFIER123'
  })

  it('completes the roundtrip on a cross-site callback (no live session) when state matches', async () => {
    const { GET } = await import('../auth/canva/callback/route')
    const res = await GET(callbackRequest({ code: 'CODE', state: 'STATE123' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('canva=connected')
    // PKCE verifier from the cookie is replayed at token exchange.
    expect(exchangeMock).toHaveBeenCalledWith('CODE', 'VERIFIER123')
    expect(storeMock).toHaveBeenCalledOnce()
  })

  it('rejects a missing PKCE verifier cookie', async () => {
    verifierCookie = undefined
    const { GET } = await import('../auth/canva/callback/route')
    const res = await GET(callbackRequest({ code: 'CODE', state: 'STATE123' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('canva=state_mismatch')
    expect(exchangeMock).not.toHaveBeenCalled()
  })

  it('rejects a state mismatch — CSRF gate preserved', async () => {
    const { GET } = await import('../auth/canva/callback/route')
    const res = await GET(callbackRequest({ code: 'CODE', state: 'WRONG' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('canva=state_mismatch')
    expect(exchangeMock).not.toHaveBeenCalled()
  })

  it('rejects a missing state cookie — no implicit trust', async () => {
    stateCookie = undefined
    const { GET } = await import('../auth/canva/callback/route')
    const res = await GET(callbackRequest({ code: 'CODE', state: 'STATE123' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('canva=state_mismatch')
    expect(exchangeMock).not.toHaveBeenCalled()
  })
})
