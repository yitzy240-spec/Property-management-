import { createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

interface GmailTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

/** Get Gmail OAuth credentials from app_settings */
async function getOAuthCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const serviceClient = createServiceClient()

  const { data: clientIdSetting } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'gmail_client_id')
    .single()

  const { data: clientSecretSetting } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'gmail_client_secret')
    .single()

  if (!clientIdSetting || !clientSecretSetting) {
    throw new Error('Gmail OAuth credentials not configured. Add them in Settings.')
  }

  return {
    clientId: await decrypt(clientIdSetting.value),
    clientSecret: await decrypt(clientSecretSetting.value),
  }
}

/** Build the Google OAuth authorization URL */
export async function getGmailAuthUrl(redirectUri: string): Promise<string> {
  const { clientId } = await getOAuthCredentials()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** Exchange authorization code for tokens */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GmailTokens> {
  const { clientId, clientSecret } = await getOAuthCredentials()

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Gmail token exchange failed:', error)
    throw new Error('Failed to exchange authorization code')
  }

  const data = await response.json()

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

/** Refresh an expired access token */
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: number }> {
  const { clientId, clientSecret } = await getOAuthCredentials()

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    throw new Error('Gmail token refresh failed — reconnect Gmail in Settings')
  }

  const data = await response.json()
  return {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

/** Get a valid Gmail access token (refreshing if needed) */
export async function getGmailAccessToken(): Promise<string> {
  const serviceClient = createServiceClient()

  const { data: tokenSetting } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'gmail_tokens')
    .single()

  if (!tokenSetting) {
    throw new Error('Gmail not connected. Connect it in Settings.')
  }

  const tokens: GmailTokens = JSON.parse(await decrypt(tokenSetting.value))

  // If token is still valid (with 5 min buffer), use it
  if (tokens.expires_at > Date.now() + 300_000) {
    return tokens.access_token
  }

  // Refresh the token
  const refreshed = await refreshAccessToken(tokens.refresh_token)

  // Update stored tokens
  const updatedTokens: GmailTokens = {
    ...tokens,
    access_token: refreshed.access_token,
    expires_at: refreshed.expires_at,
  }

  await serviceClient
    .from('app_settings')
    .update({
      value: await encrypt(JSON.stringify(updatedTokens)),
      updated_at: new Date().toISOString(),
    })
    .eq('key', 'gmail_tokens')

  return refreshed.access_token
}

/** Store Gmail tokens (encrypted) after initial OAuth */
export async function storeGmailTokens(tokens: GmailTokens): Promise<void> {
  const serviceClient = createServiceClient()

  await serviceClient
    .from('app_settings')
    .upsert(
      {
        key: 'gmail_tokens',
        value: await encrypt(JSON.stringify(tokens)),
        description: 'Gmail OAuth tokens (encrypted)',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
}

/** Check if Gmail is connected */
export async function isGmailConnected(): Promise<boolean> {
  const serviceClient = createServiceClient()
  const { data } = await serviceClient
    .from('app_settings')
    .select('key')
    .eq('key', 'gmail_tokens')
    .single()
  return !!data
}

/** Fetch recent messages with PDF attachments (utility bills) */
export async function fetchBillEmails(maxResults: number = 10): Promise<{
  messages: { id: string; subject: string; from: string; date: string; attachments: { filename: string; attachmentId: string }[] }[]
}> {
  const accessToken = await getGmailAccessToken()

  // Search for emails with PDF attachments (common bill patterns)
  const query = 'has:attachment filename:pdf (arnona OR electricity OR IEC OR water OR "va\'ad bayit" OR חשבון OR ארנונה OR חשמל OR מים)'

  const listResponse = await fetch(
    `${GMAIL_API_BASE}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!listResponse.ok) {
    throw new Error('Failed to fetch Gmail messages')
  }

  const listData = await listResponse.json()

  if (!listData.messages || listData.messages.length === 0) {
    return { messages: [] }
  }

  const messages = []

  for (const msg of listData.messages) {
    const msgResponse = await fetch(
      `${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!msgResponse.ok) continue

    const msgData = await msgResponse.json()
    const headers = msgData.payload?.headers || []

    const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value || 'No subject'
    const from = headers.find((h: { name: string }) => h.name === 'From')?.value || ''
    const date = headers.find((h: { name: string }) => h.name === 'Date')?.value || ''

    // Find PDF attachments
    const attachments: { filename: string; attachmentId: string }[] = []

    function findAttachments(parts: { filename?: string; mimeType?: string; body?: { attachmentId?: string }; parts?: unknown[] }[]) {
      for (const part of parts) {
        if (part.filename && part.mimeType === 'application/pdf' && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            attachmentId: part.body.attachmentId,
          })
        }
        if (part.parts) {
          findAttachments(part.parts as typeof parts)
        }
      }
    }

    if (msgData.payload?.parts) {
      findAttachments(msgData.payload.parts)
    }

    if (attachments.length > 0) {
      messages.push({ id: msg.id, subject, from, date, attachments })
    }
  }

  return { messages }
}
