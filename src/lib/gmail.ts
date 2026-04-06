import { createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

interface GmailTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

/** Get Gmail OAuth credentials from environment variables */
function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in environment variables.')
  }

  return { clientId, clientSecret }
}

/** Build the Google OAuth authorization URL */
export async function getGmailAuthUrl(redirectUri: string): Promise<string> {
  const { clientId } = getOAuthCredentials()

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
  const { clientId, clientSecret } = getOAuthCredentials()

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
  const { clientId, clientSecret } = getOAuthCredentials()

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

// ══════════════════════════════════════
// BILL EMAIL FETCHING
// ══════════════════════════════════════

export interface BillEmail {
  id: string
  subject: string
  from: string
  date: string
  // Content for AI parsing — either PDF or HTML body
  pdfBase64: string | null
  pdfFilename: string | null
  htmlBody: string | null
  attachmentId: string | null
}

/** Fetch bill emails — returns emails with either PDF attachments or HTML bodies for AI parsing */
export async function fetchBillEmails(maxResults: number = 20): Promise<{ messages: BillEmail[] }> {
  const accessToken = await getGmailAccessToken()

  // Search by known utility senders + bill keywords, from Jan 2026 onwards
  const query = 'after:2026/01/01 (from:iec.co.il OR from:hagihon OR from:printernet.co.il OR from:bezeq.co.il OR from:hyp.co.il OR from:iriya OR (חשבון OR "אישור תשלום" OR ארנונה OR חשמל OR מים OR "ועד בית" OR "חשבון תקופתי"))'

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

  const messages: BillEmail[] = []

  for (const msg of listData.messages) {
    try {
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

      // Look for PDF attachments
      let pdfFilename: string | null = null
      let attachmentId: string | null = null

      function findPdf(parts: { filename?: string; mimeType?: string; body?: { attachmentId?: string; data?: string }; parts?: unknown[] }[]) {
        for (const part of parts) {
          if (part.filename && (part.mimeType === 'application/pdf' || part.filename.toLowerCase().endsWith('.pdf')) && part.body?.attachmentId) {
            pdfFilename = part.filename
            attachmentId = part.body.attachmentId
            return
          }
          if (part.parts) {
            findPdf(part.parts as typeof parts)
          }
        }
      }

      if (msgData.payload?.parts) {
        findPdf(msgData.payload.parts)
      }

      // Extract HTML body for AI parsing (if no PDF, or in addition to PDF)
      let htmlBody: string | null = null

      function findHtml(parts: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[]) {
        for (const part of parts) {
          if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64url').toString('utf-8')
            return
          }
          if (part.parts) {
            findHtml(part.parts as typeof parts)
          }
        }
      }

      if (msgData.payload?.parts) {
        findHtml(msgData.payload.parts)
      } else if (msgData.payload?.body?.data && msgData.payload?.mimeType === 'text/html') {
        htmlBody = Buffer.from(msgData.payload.body.data, 'base64url').toString('utf-8')
      }

      // Include email if it has either a PDF or HTML body
      if (pdfFilename || htmlBody) {
        messages.push({
          id: msg.id,
          subject,
          from,
          date,
          pdfBase64: null, // Downloaded later in the cron route
          pdfFilename,
          htmlBody,
          attachmentId,
        })
      }
    } catch {
      // Skip individual email errors
      continue
    }
  }

  return { messages }
}
