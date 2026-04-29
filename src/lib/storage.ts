import { randomUUID } from 'crypto'

/**
 * Build a safe ASCII Supabase Storage object key from an optional user-supplied
 * filename. Supabase Storage rejects non-ASCII keys (e.g., Hebrew chars) and
 * keys with spaces/control chars, so we never trust the original filename for
 * the key — we use a UUID + sanitized extension instead.
 *
 * Strategy:
 * - Random UUID provides uniqueness without collision risk
 * - Extension is lowercased and stripped to [a-z0-9] only (falls back to 'bin')
 * - The original filename should be persisted separately on the row that owns
 *   this object so downloads can preserve the human-readable name
 *
 * @param prefix - Folder prefix in the bucket (no trailing slash), e.g. "vault" or "bills"
 * @param originalFilename - The user-supplied filename (may contain Hebrew, spaces, etc.)
 * @returns the full storage key (path including UUID + sanitized extension)
 */
export function buildStorageKey(prefix: string, originalFilename: string): string {
  const ext = sanitizeExtension(originalFilename)
  const uuid = randomUUID()
  return `${prefix}/${uuid}.${ext}`
}

/**
 * Extract and sanitize the file extension from a filename.
 * Lowercase, strip any non-[a-z0-9] chars, fall back to 'bin' if empty.
 *
 * Exported so other upload sites (property images, visit media) can share the
 * same sanitization rules instead of inlining the regex.
 */
export function sanitizeExtension(filename: string): string {
  if (!filename) return 'bin'
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === filename.length - 1) return 'bin'
  const raw = filename.slice(dotIndex + 1).toLowerCase()
  const cleaned = raw.replace(/[^a-z0-9]/g, '')
  return cleaned || 'bin'
}

/**
 * RFC 5987 encode a filename for use in a Content-Disposition header's
 * `filename*` parameter. This preserves non-ASCII characters (e.g., Hebrew)
 * across browsers when downloading files.
 *
 * Returns the value portion only, e.g., `UTF-8''%D7%9E%D7%A9%D7%A4...`,
 * suitable for use as: `Content-Disposition: attachment; filename*=<this>`.
 */
export function encodeContentDispositionFilename(name: string): string {
  // RFC 5987: percent-encode UTF-8 bytes, but the spec reserves a small set of
  // attribute chars that must NOT be percent-encoded literally. encodeURIComponent
  // covers the safety we need — we additionally encode the few chars it leaves
  // alone that are unsafe in a header param value.
  const encoded = encodeURIComponent(name)
    // encodeURIComponent leaves these alone but they're unsafe in a header param:
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  return `UTF-8''${encoded}`
}
