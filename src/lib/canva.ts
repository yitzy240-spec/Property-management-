export interface CanvaTokens {
  access_token: string
  refresh_token: string
  expires_at: string
}

export function parseCanvaDesignId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)/)
  return match?.[1] ?? null
}
