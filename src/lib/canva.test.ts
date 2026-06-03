import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import crypto from 'crypto'
import {
  parseCanvaDesignId,
  updateCanvaDesignCodes,
  generatePkcePair,
  getCanvaAuthorizeUrl,
  exchangeCodeForTokens,
} from './canva'

describe('parseCanvaDesignId', () => {
  it('extracts ID from a standard Canva URL', () => {
    expect(parseCanvaDesignId('https://www.canva.com/design/DAGmTDKfFrI/abc/view')).toBe('DAGmTDKfFrI')
  })

  it('handles URLs without www', () => {
    expect(parseCanvaDesignId('https://canva.com/design/DAHCHqRRpzI/edit')).toBe('DAHCHqRRpzI')
  })

  it('returns null for non-Canva URLs', () => {
    expect(parseCanvaDesignId('https://example.com/design/foo')).toBeNull()
  })

  it('returns null for empty/null input', () => {
    expect(parseCanvaDesignId('')).toBeNull()
    expect(parseCanvaDesignId(null)).toBeNull()
  })
})

describe('updateCanvaDesignCodes — request shape', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete process.env.ANTHROPIC_API_KEY
  })

  function captureRequestBody() {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '{"success":true,"message":"ok"}' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('references the canva mcp_server via an mcp_toolset (required by mcp-client-2025-11-20)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    const fetchMock = captureRequestBody()

    await updateCanvaDesignCodes({
      designId: 'DAGtest',
      designName: 'Apt 1 Guide',
      newApartmentCode: '1234',
      accessToken: 'canva-token',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)['anthropic-beta']).toBe('mcp-client-2025-11-20')

    const body = JSON.parse(init.body as string)
    // Server is declared
    expect(body.mcp_servers).toHaveLength(1)
    expect(body.mcp_servers[0].name).toBe('canva')
    // ...and referenced by exactly one toolset, or the API loads zero tools
    expect(body.tools).toEqual([{ type: 'mcp_toolset', mcp_server_name: 'canva' }])
    expect(body.tools[0].mcp_server_name).toBe(body.mcp_servers[0].name)
  })
})

describe('Canva OAuth PKCE', () => {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET', 'NEXT_PUBLIC_APP_URL']) {
      saved[k] = process.env[k]
    }
    process.env.CANVA_CLIENT_ID = 'cid'
    process.env.CANVA_CLIENT_SECRET = 'secret'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('generatePkcePair derives an S256 challenge from the verifier', () => {
    const { verifier, challenge } = generatePkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(challenge).toBe(crypto.createHash('sha256').update(verifier).digest('base64url'))
    // base64url — no +, /, or = padding
    expect(challenge).not.toMatch(/[+/=]/)
  })

  it('getCanvaAuthorizeUrl includes code_challenge and S256 method (required by Canva)', () => {
    const url = new URL(getCanvaAuthorizeUrl('STATE', 'CHALLENGE'))
    expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('STATE')
  })

  it('exchangeCodeForTokens replays the code_verifier at token exchange', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await exchangeCodeForTokens('CODE', 'VERIFIER')

    const [, init] = fetchMock.mock.calls[0]
    const body = init.body as URLSearchParams
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('CODE')
    expect(body.get('code_verifier')).toBe('VERIFIER')
  })
})
