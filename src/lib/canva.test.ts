import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseCanvaDesignId, getCanvaEmbedUrl, resolveCanvaDesignUrl } from './canva'

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

describe('getCanvaEmbedUrl', () => {
  it('preserves the share token (required for anonymous guest viewing)', () => {
    expect(getCanvaEmbedUrl('https://www.canva.com/design/DAGmTDKfFrI/abc/view'))
      .toBe('https://www.canva.com/design/DAGmTDKfFrI/abc/view?embed')
  })
  it('builds a tokenless embed URL when the link has no token', () => {
    expect(getCanvaEmbedUrl('https://www.canva.com/design/DAGmTDKfFrI/view'))
      .toBe('https://www.canva.com/design/DAGmTDKfFrI/view?embed')
  })
  it('returns null for non-Canva or empty input', () => {
    expect(getCanvaEmbedUrl(null)).toBeNull()
    expect(getCanvaEmbedUrl('')).toBeNull()
    expect(getCanvaEmbedUrl('https://example.com/x')).toBeNull()
  })
})

describe('resolveCanvaDesignUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('canonicalizes a direct design link, keeping the token, without any network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await resolveCanvaDesignUrl('https://www.canva.com/design/DAGmTDKfFrI/abc/edit?x=1'))
      .toBe('https://www.canva.com/design/DAGmTDKfFrI/abc/view')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null for empty/null input', async () => {
    expect(await resolveCanvaDesignUrl(null)).toBeNull()
    expect(await resolveCanvaDesignUrl('   ')).toBeNull()
  })

  it('resolves a canva.link short link via its redirect Location header', async () => {
    const fetchMock = vi.fn(async () => ({
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'location'
            ? 'https://www.canva.com/design/DAHCHqRRpzI/tok/edit?utm_content=DAHCHqRRpzI'
            : null,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await resolveCanvaDesignUrl('https://canva.link/honh3op06pgtcpk'))
      .toBe('https://www.canva.com/design/DAHCHqRRpzI/tok/view')
  })

  it('keeps the original link if the redirect cannot be resolved to an id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ headers: { get: () => null } })))
    expect(await resolveCanvaDesignUrl('https://canva.link/unknown')).toBe('https://canva.link/unknown')
  })

  it('keeps the original link if the network call throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await resolveCanvaDesignUrl('https://canva.link/down')).toBe('https://canva.link/down')
  })
})
