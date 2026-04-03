import { describe, it, expect, beforeAll } from 'vitest'

// Set encryption key before import
process.env.ENCRYPTION_KEY = 'test-encryption-key-minimum-32-characters-long!'

import { encrypt, decrypt } from './encryption'

describe('Encryption', () => {
  it('encrypts and decrypts a string', async () => {
    const plaintext = 'sk_live_abc123_my_api_key'
    const encrypted = await encrypt(plaintext)
    const decrypted = await decrypt(encrypted)

    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertext each time (random IV)', async () => {
    const plaintext = 'same-input'
    const encrypted1 = await encrypt(plaintext)
    const encrypted2 = await encrypt(plaintext)

    expect(encrypted1).not.toBe(encrypted2)

    // But both decrypt to the same value
    expect(await decrypt(encrypted1)).toBe(plaintext)
    expect(await decrypt(encrypted2)).toBe(plaintext)
  })

  it('handles empty string', async () => {
    const encrypted = await encrypt('')
    const decrypted = await decrypt(encrypted)
    expect(decrypted).toBe('')
  })

  it('handles long strings', async () => {
    const longString = 'a'.repeat(10000)
    const encrypted = await encrypt(longString)
    const decrypted = await decrypt(encrypted)
    expect(decrypted).toBe(longString)
  })

  it('handles special characters', async () => {
    const special = '₪122,833.00 — "שלום" & <script>alert(1)</script>'
    const encrypted = await encrypt(special)
    const decrypted = await decrypt(encrypted)
    expect(decrypted).toBe(special)
  })

  it('encrypted output is base64', async () => {
    const encrypted = await encrypt('test')
    // Base64 characters only
    expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/)
  })

  it('rejects tampered ciphertext', async () => {
    const encrypted = await encrypt('test')
    const tampered = encrypted.slice(0, -4) + 'XXXX'

    await expect(decrypt(tampered)).rejects.toThrow()
  })
})
