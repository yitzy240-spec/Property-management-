/**
 * AES-256-GCM encryption for app_settings values (API keys, secrets).
 * Uses ENCRYPTION_KEY from environment variables.
 *
 * Usage:
 *   const encrypted = await encrypt('my-api-key')
 *   const decrypted = await decrypt(encrypted)
 *
 * The ENCRYPTION_KEY env var must be at least 32 characters.
 * Generate one with: openssl rand -base64 32
 */

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12
const TAG_LENGTH = 128

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length < 32) {
    throw new Error(
      'ENCRYPTION_KEY must be set and at least 32 characters. Generate with: openssl rand -base64 32'
    )
  }
  return key
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret).slice(0, 32),
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  )
  return keyMaterial
}

/** Encrypt a plaintext string. Returns base64-encoded iv:ciphertext */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey(getKey())
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoder = new TextEncoder()

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    encoder.encode(plaintext)
  )

  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return Buffer.from(combined).toString('base64')
}

/** Decrypt a base64-encoded iv:ciphertext string */
export async function decrypt(encrypted: string): Promise<string> {
  const key = await deriveKey(getKey())
  const combined = new Uint8Array(Buffer.from(encrypted, 'base64'))

  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}
