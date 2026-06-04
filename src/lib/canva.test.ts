import { describe, it, expect } from 'vitest'
import { parseCanvaDesignId, getCanvaEmbedUrl } from './canva'

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
  it('builds the embed URL from a sharing link', () => {
    expect(getCanvaEmbedUrl('https://www.canva.com/design/DAGmTDKfFrI/abc/view'))
      .toBe('https://www.canva.com/design/DAGmTDKfFrI/view?embed')
  })
  it('returns null for non-Canva or empty input', () => {
    expect(getCanvaEmbedUrl(null)).toBeNull()
    expect(getCanvaEmbedUrl('')).toBeNull()
    expect(getCanvaEmbedUrl('https://example.com/x')).toBeNull()
  })
})
