import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseCanvaDesignId, updateCanvaDesignCodes } from './canva'

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
