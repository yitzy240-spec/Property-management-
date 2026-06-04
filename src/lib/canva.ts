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
