import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'

const CANVA_TOKEN_ENDPOINT = 'https://api.canva.com/rest/v1/oauth/token'
const CANVA_AUTHORIZE_ENDPOINT = 'https://www.canva.com/api/oauth/authorize'

/**
 * Canva Connect OAuth requires PKCE (SHA-256). Generate a random code_verifier
 * and its S256 code_challenge. The verifier is stashed in a cookie by the start
 * route and replayed at token exchange; the challenge goes on the authorize URL.
 */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

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

export function getCanvaAuthorizeUrl(state: string, codeChallenge: string): string {
  const clientId = process.env.CANVA_CLIENT_ID
  if (!clientId) throw new Error('CANVA_CLIENT_ID env var not configured')
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/canva/callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'design:content:read design:content:write design:meta:read',
    // PKCE (required by Canva): omitting these returns a 400 at the authorize step.
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })
  return `${CANVA_AUTHORIZE_ENDPOINT}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<CanvaTokens> {
  const clientId = process.env.CANVA_CLIENT_ID
  const clientSecret = process.env.CANVA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Canva OAuth client not configured')
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/canva/callback`

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(CANVA_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      // PKCE: the verifier matching the code_challenge sent at authorize time.
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canva token exchange failed: ${res.status} ${text}`)
  }

  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  }
}

export async function storeCanvaTokens(tokens: CanvaTokens): Promise<void> {
  const client = createServiceClient()
  const rows = [
    { key: 'canva_access_token', value: await encrypt(tokens.access_token) },
    { key: 'canva_refresh_token', value: await encrypt(tokens.refresh_token) },
    { key: 'canva_token_expires_at', value: tokens.expires_at },
  ]
  for (const row of rows) {
    // Surface persistence failures instead of swallowing them — otherwise the
    // callback reports "connected" while nothing was actually stored.
    const { error } = await client.from('app_settings').upsert(row, { onConflict: 'key' })
    if (error) {
      throw new Error(`Failed to persist ${row.key}: ${error.message}`)
    }
  }
}

export async function loadCanvaTokens(): Promise<CanvaTokens | null> {
  const client = createServiceClient()
  const { data, error } = await client
    .from('app_settings')
    .select('key, value')
    .in('key', ['canva_access_token', 'canva_refresh_token', 'canva_token_expires_at'])
  if (error) {
    console.error('[canva load] select failed:', error.message)
    return null
  }
  if (!data || data.length < 3) {
    console.error(`[canva load] expected 3 token rows, found ${data?.length ?? 0}`)
    return null
  }
  const map = Object.fromEntries(data.map((r) => [r.key, r.value]))
  if (!map.canva_access_token || !map.canva_refresh_token || !map.canva_token_expires_at) {
    console.error('[canva load] one or more token rows had an empty value')
    return null
  }
  try {
    return {
      access_token: await decrypt(map.canva_access_token),
      refresh_token: await decrypt(map.canva_refresh_token),
      expires_at: map.canva_token_expires_at,
    }
  } catch (err) {
    console.error('[canva load] decrypt failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function clearCanvaTokens(): Promise<void> {
  const client = createServiceClient()
  await client.from('app_settings').delete().in('key', [
    'canva_access_token',
    'canva_refresh_token',
    'canva_token_expires_at',
  ])
}

export interface UpdateDesignCodesInput {
  designId: string
  designName: string
  newApartmentCode?: string
  newBuildingCode?: string
  accessToken: string
}

export interface UpdateDesignResult {
  success: boolean
  message: string
}

export async function updateCanvaDesignCodes(input: UpdateDesignCodesInput): Promise<UpdateDesignResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var not configured')

  const systemPrompt = `You are an agent that updates codes in Canva apartment guides.
You have access to the Canva MCP.
Given a design ID and one or both new codes to update:
1. Call get-design-content with the design_id to read the current text
2. Find the current values for any codes that need updating (look for "Apartment codes:" and "Building code:" labels on the check-in page)
3. Call start-editing-transaction with the design_id
4. For each code that needs updating, use find_and_replace_text operation via perform-editing-operations to replace the old value with the new one
5. Call commit-editing-transaction to save
Respond ONLY with JSON: {"success": true/false, "message": "..."}`

  const userMessage = `Update codes in Canva design "${input.designId}" (${input.designName}).
${input.newApartmentCode ? `Set the apartment code to: "${input.newApartmentCode}" — find the current value after the label "Apartment codes:" and replace it.` : ''}
${input.newBuildingCode ? `Set the building code to: "${input.newBuildingCode}" — find the current value after the label "Building code:" and replace it.` : ''}
Only update the fields listed above.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-11-20',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      mcp_servers: [
        {
          type: 'url',
          url: 'https://mcp.canva.com/mcp',
          name: 'canva',
          authorization_token: input.accessToken,
        },
      ],
      // Under the mcp-client-2025-11-20 beta, tool config lives in a separate
      // mcp_toolset entry. Every server in mcp_servers MUST be referenced by
      // exactly one toolset or the request loads zero tools (NO_TOOLS_AVAILABLE).
      tools: [
        {
          type: 'mcp_toolset',
          mcp_server_name: 'canva',
        },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, message: `Anthropic API ${response.status}: ${text.slice(0, 200)}` }
  }

  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> }
  const fullText = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')

  const match = fullText.match(/\{[\s\S]*\}/)
  if (!match) return { success: false, message: fullText || 'No JSON in response' }
  try {
    const parsed = JSON.parse(match[0]) as { success: boolean; message: string }
    return parsed
  } catch {
    return { success: false, message: 'Failed to parse JSON response' }
  }
}

export async function refreshCanvaTokensIfNeeded(): Promise<CanvaTokens | null> {
  const tokens = await loadCanvaTokens()
  if (!tokens) return null
  const expiresAt = new Date(tokens.expires_at)
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000)
  if (expiresAt > fiveMinFromNow) return tokens

  const clientId = process.env.CANVA_CLIENT_ID
  const clientSecret = process.env.CANVA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Canva OAuth client not configured')
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(CANVA_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canva token refresh failed: ${res.status} ${text}`)
  }
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
  const updated: CanvaTokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  }
  await storeCanvaTokens(updated)
  return updated
}
