/** A parsed Canva design link: its id plus the optional public-access token. */
export interface CanvaDesign {
  id: string
  /**
   * The share token segment (e.g. `dO-fqxanGDBRpeWnvtupOg`). Canva requires
   * this token for ANONYMOUS viewers — without it, `/view` redirects to login,
   * so guests can never see the guide. Null for owner/short links that omit it.
   */
  token: string | null
}

const VIEW_MODES = new Set(['view', 'edit', 'watch', 'embed'])

/**
 * Parse a Canva design URL into `{ id, token }`.
 * Handles `/design/<id>/view`, `/design/<id>/<token>/view`, `.../edit`, etc.
 * The segment after the id is treated as a token unless it's a view mode.
 */
export function parseCanvaDesign(url: string | null): CanvaDesign | null {
  if (!url) return null
  const match = url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?/)
  if (!match) return null
  const token = match[2] && !VIEW_MODES.has(match[2]) ? match[2] : null
  return { id: match[1], token }
}

/** Extract just the Canva design ID from a design sharing URL. */
export function parseCanvaDesignId(url: string | null): string | null {
  return parseCanvaDesign(url)?.id ?? null
}

/** Path segment for a design: `<id>/<token>` when a token is present, else `<id>`. */
function designPath(design: CanvaDesign): string {
  return design.token ? `${design.id}/${design.token}` : design.id
}

/** Build the public embed-viewer URL for a Canva design from its sharing link. */
export function getCanvaEmbedUrl(url: string | null): string | null {
  const design = parseCanvaDesign(url)
  return design ? `https://www.canva.com/design/${designPath(design)}/view?embed` : null
}

/**
 * Normalize any Canva share URL to a canonical public-view link
 * (https://www.canva.com/design/<id>/<token>/view) so the parser + embed work.
 * The share token MUST be preserved — it grants anonymous viewers access; a
 * tokenless `/view` link redirects guests to Canva's login page.
 * Direct design links resolve synchronously; short links (canva.link/...) are
 * resolved by following the redirect and reading the design from Location.
 * Returns the original input unchanged when no design can be determined,
 * and null for empty input. Server-side only (performs a network request).
 */
export async function resolveCanvaDesignUrl(input: string | null): Promise<string | null> {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const direct = parseCanvaDesign(trimmed)
  if (direct) {
    console.log('[canva-debug] resolve direct', { input: trimmed, design: direct }) // TEMP debug
    return `https://www.canva.com/design/${designPath(direct)}/view`
  }

  try {
    const res = await fetch(trimmed, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
    const location = res.headers.get('location')
    const resolved = parseCanvaDesign(location)
    console.log('[canva-debug] resolve redirect', { input: trimmed, status: res.status, location, resolved }) // TEMP debug
    if (resolved) return `https://www.canva.com/design/${designPath(resolved)}/view`
  } catch (e) {
    console.log('[canva-debug] resolve fetch failed', { input: trimmed, error: String(e) }) // TEMP debug
  }
  return trimmed
}
