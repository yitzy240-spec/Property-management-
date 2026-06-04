/** Extract the Canva design ID from a design sharing URL. */
export function parseCanvaDesignId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)/)
  return match?.[1] ?? null
}

/** Build the public embed-viewer URL for a Canva design from its sharing link. */
export function getCanvaEmbedUrl(url: string | null): string | null {
  const id = parseCanvaDesignId(url)
  return id ? `https://www.canva.com/design/${id}/view?embed` : null
}

/**
 * Normalize any Canva share URL to a canonical public-view link
 * (https://www.canva.com/design/<id>/view) so the parser + embed work.
 * Direct design links resolve synchronously; short links (canva.link/...) are
 * resolved by following the redirect and reading the design id from Location.
 * Returns the original input unchanged when no design id can be determined,
 * and null for empty input. Server-side only (performs a network request).
 */
export async function resolveCanvaDesignUrl(input: string | null): Promise<string | null> {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const directId = parseCanvaDesignId(trimmed)
  if (directId) return `https://www.canva.com/design/${directId}/view`

  try {
    const res = await fetch(trimmed, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
    const resolvedId = parseCanvaDesignId(res.headers.get('location'))
    if (resolvedId) return `https://www.canva.com/design/${resolvedId}/view`
  } catch {
    // Network/timeout failure — fall through and keep the original input.
  }
  return trimmed
}
