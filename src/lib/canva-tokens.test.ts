import { describe, it, expect, vi, beforeEach } from 'vitest'
import { storeCanvaTokens, loadCanvaTokens } from './canva'

/**
 * storeCanvaTokens must NOT silently swallow a failed write — otherwise the
 * OAuth callback redirects to ?canva=connected while nothing was persisted,
 * and the Settings/Codes pages then read back "not connected". loadCanvaTokens
 * must return null (not throw) and log the reason when tokens can't be read.
 */

let upsertError: { message: string } | null = null
let selectData: Array<{ key: string; value: string }> | null = []
let selectError: { message: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: async () => ({ error: upsertError }),
      select: () => ({ in: async () => ({ data: selectData, error: selectError }) }),
    }),
  }),
}))

vi.mock('@/lib/encryption', () => ({
  encrypt: async (s: string) => `enc(${s})`,
  decrypt: async (s: string) => {
    const m = s.match(/^enc\((.*)\)$/)
    if (!m) throw new Error('bad ciphertext')
    return m[1]
  },
}))

const tokens = { access_token: 'a', refresh_token: 'r', expires_at: '2026-01-01T00:00:00.000Z' }

describe('storeCanvaTokens', () => {
  beforeEach(() => {
    upsertError = null
  })

  it('resolves when every upsert succeeds', async () => {
    await expect(storeCanvaTokens(tokens)).resolves.toBeUndefined()
  })

  it('throws when an upsert returns an error (no silent false-positive)', async () => {
    upsertError = { message: 'no unique constraint' }
    await expect(storeCanvaTokens(tokens)).rejects.toThrow(/Failed to persist .*no unique constraint/)
  })
})

describe('loadCanvaTokens', () => {
  beforeEach(() => {
    selectError = null
    selectData = [
      { key: 'canva_access_token', value: 'enc(a)' },
      { key: 'canva_refresh_token', value: 'enc(r)' },
      { key: 'canva_token_expires_at', value: '2026-01-01T00:00:00.000Z' },
    ]
  })

  it('returns decrypted tokens when all three rows are present', async () => {
    const result = await loadCanvaTokens()
    expect(result).toEqual({ access_token: 'a', refresh_token: 'r', expires_at: '2026-01-01T00:00:00.000Z' })
  })

  it('returns null when fewer than three rows are stored', async () => {
    selectData = [{ key: 'canva_access_token', value: 'enc(a)' }]
    expect(await loadCanvaTokens()).toBeNull()
  })

  it('returns null (does not throw) on a select error', async () => {
    selectError = { message: 'permission denied' }
    selectData = null
    expect(await loadCanvaTokens()).toBeNull()
  })

  it('returns null (does not throw) when decryption fails', async () => {
    selectData = [
      { key: 'canva_access_token', value: 'not-encrypted' },
      { key: 'canva_refresh_token', value: 'enc(r)' },
      { key: 'canva_token_expires_at', value: '2026-01-01T00:00:00.000Z' },
    ]
    expect(await loadCanvaTokens()).toBeNull()
  })
})
