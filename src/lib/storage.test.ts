import { describe, it, expect } from 'vitest'
import { buildStorageKey, encodeContentDispositionFilename } from './storage'

describe('buildStorageKey', () => {
  it('returns ASCII-only keys for ASCII filenames', () => {
    const { key } = buildStorageKey('vault', 'invoice.pdf')
    expect(key).toMatch(/^vault\/[a-f0-9-]{36}\.pdf$/)
    // Must be pure ASCII
    expect(/^[\x20-\x7E]+$/.test(key)).toBe(true)
  })

  it('produces ASCII-only keys for Hebrew filenames', () => {
    const { key, ext } = buildStorageKey('vault', 'משפחת מרקוס.pdf')
    expect(/^[\x20-\x7E]+$/.test(key)).toBe(true)
    expect(key).toMatch(/^vault\/[a-f0-9-]{36}\.pdf$/)
    expect(ext).toBe('pdf')
    // No Hebrew, no spaces, no underscores from raw filename
    expect(key).not.toMatch(/[\u0590-\u05FF]/)
    expect(key).not.toContain(' ')
    expect(key).not.toContain('משפחת')
  })

  it('lowercases the extension', () => {
    const { key, ext } = buildStorageKey('vault', 'Document.PDF')
    expect(ext).toBe('pdf')
    expect(key).toMatch(/\.pdf$/)
  })

  it('strips non-alphanumeric chars from the extension', () => {
    const { ext } = buildStorageKey('vault', 'file.p-d_f')
    expect(ext).toBe('pdf')
  })

  it('falls back to "bin" when there is no extension', () => {
    const { ext, key } = buildStorageKey('vault', 'README')
    expect(ext).toBe('bin')
    expect(key).toMatch(/\.bin$/)
  })

  it('falls back to "bin" for empty filename', () => {
    const { ext } = buildStorageKey('vault', '')
    expect(ext).toBe('bin')
  })

  it('falls back to "bin" when filename ends with a dot', () => {
    const { ext } = buildStorageKey('vault', 'weird.')
    expect(ext).toBe('bin')
  })

  it('falls back to "bin" when extension contains only non-alphanumerics', () => {
    const { ext } = buildStorageKey('vault', 'odd.!@#$')
    expect(ext).toBe('bin')
  })

  it('handles Hebrew-only filename without extension', () => {
    const { key, ext } = buildStorageKey('vault', 'משפחה')
    expect(/^[\x20-\x7E]+$/.test(key)).toBe(true)
    expect(ext).toBe('bin')
  })

  it('produces unique keys for repeated calls', () => {
    const a = buildStorageKey('vault', 'doc.pdf').key
    const b = buildStorageKey('vault', 'doc.pdf').key
    expect(a).not.toBe(b)
  })

  it('respects the prefix', () => {
    const { key } = buildStorageKey('bills', 'foo.pdf')
    expect(key.startsWith('bills/')).toBe(true)
  })
})

describe('encodeContentDispositionFilename', () => {
  it('encodes Hebrew characters as percent-escaped UTF-8', () => {
    const encoded = encodeContentDispositionFilename('משפחת מרקוס.pdf')
    expect(encoded.startsWith("UTF-8''")).toBe(true)
    // Hebrew letter ש = U+05E9 = UTF-8 0xD7 0xA9
    expect(encoded).toContain('%D7')
    // No raw Hebrew in the encoded output
    expect(encoded).not.toMatch(/[\u0590-\u05FF]/)
  })

  it('encodes spaces', () => {
    const encoded = encodeContentDispositionFilename('my file.pdf')
    expect(encoded).toContain('%20')
    expect(encoded).not.toContain(' ')
  })

  it('encodes single quotes (RFC 5987 attribute-value safety)', () => {
    const encoded = encodeContentDispositionFilename("o'brien.pdf")
    // The value portion (after the UTF-8'' prefix) must not contain a literal '
    const valuePart = encoded.replace(/^UTF-8''/, '')
    expect(valuePart).toContain('%27')
    expect(valuePart).not.toContain("'")
  })

  it('uses the UTF-8 prefix per RFC 5987', () => {
    const encoded = encodeContentDispositionFilename('plain.pdf')
    expect(encoded).toBe("UTF-8''plain.pdf")
  })

  it('round-trips Hebrew via decodeURIComponent', () => {
    const original = 'משפחת מרקוס.pdf'
    const encoded = encodeContentDispositionFilename(original)
    const valuePart = encoded.replace(/^UTF-8''/, '')
    expect(decodeURIComponent(valuePart)).toBe(original)
  })
})
