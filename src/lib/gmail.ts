import { createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

interface GmailTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Gmail OAuth not configured.')
  }
  return { clientId, clientSecret }
}

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

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GmailTokens> {
  const { clientId, clientSecret } = getOAuthCredentials()
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  if (!response.ok) throw new Error('Failed to exchange authorization code')
  const data = await response.json()
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 }
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: number }> {
  const { clientId, clientSecret } = getOAuthCredentials()
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
  })
  if (!response.ok) throw new Error('Gmail token refresh failed — reconnect Gmail in Settings')
  const data = await response.json()
  return { access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }
}

export async function getGmailAccessToken(): Promise<string> {
  const serviceClient = createServiceClient()
  const { data: tokenSetting } = await serviceClient.from('app_settings').select('value').eq('key', 'gmail_tokens').single()
  if (!tokenSetting) throw new Error('Gmail not connected.')
  const tokens: GmailTokens = JSON.parse(await decrypt(tokenSetting.value))
  if (tokens.expires_at > Date.now() + 300_000) return tokens.access_token
  const refreshed = await refreshAccessToken(tokens.refresh_token)
  const updatedTokens: GmailTokens = { ...tokens, access_token: refreshed.access_token, expires_at: refreshed.expires_at }
  await serviceClient.from('app_settings').update({ value: await encrypt(JSON.stringify(updatedTokens)), updated_at: new Date().toISOString() }).eq('key', 'gmail_tokens')
  return refreshed.access_token
}

export async function storeGmailTokens(tokens: GmailTokens): Promise<void> {
  const serviceClient = createServiceClient()
  await serviceClient.from('app_settings').upsert({ key: 'gmail_tokens', value: await encrypt(JSON.stringify(tokens)), description: 'Gmail OAuth tokens (encrypted)', updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

export async function isGmailConnected(): Promise<boolean> {
  const serviceClient = createServiceClient()
  const { data } = await serviceClient.from('app_settings').select('key').eq('key', 'gmail_tokens').single()
  return !!data
}

// ══════════════════════════════════════
// BILL EMAIL FETCHING — Per-sender targeted queries
// ══════════════════════════════════════

export interface BillEmail {
  id: string
  subject: string
  from: string
  date: string
  pdfFilename: string | null
  htmlBody: string | null
  attachmentId: string | null
}

/**
 * Fetch bill emails using Gmail label OR per-sender queries.
 *
 * Preferred: Marcus creates a Gmail label "bills" and filters utility emails into it.
 * Fallback: per-sender targeted queries for known Israeli utilities.
 */
export async function fetchBillEmails(maxResults: number = 50): Promise<{ messages: BillEmail[] }> {
  const accessToken = await getGmailAccessToken()
  const allMessages: BillEmail[] = []
  const seenIds = new Set<string>()

  // Strategy 1: Search by Gmail label (if Marcus set up a "bills" label)
  // Strategy 2: Search by known senders
  const queries = [
    'label:bills after:2026/01/01',  // Primary: label-based (if configured)
    'after:2026/01/01 from:noreplys@iec.co.il',
    'after:2026/01/01 from:hagihon@printernet.co.il',
    'after:2026/01/01 from:bezeq_mail@bezeq.co.il has:attachment',
    'after:2026/01/01 from:ipos@hyp.co.il',
    'after:2026/01/01 "אישור תשלום" has:attachment',
  ]

  for (const query of queries) {
    try {
      const listRes = await fetch(
        `${GMAIL_API_BASE}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!listRes.ok) continue
      const listData = await listRes.json()
      if (!listData.messages) continue

      for (const msg of listData.messages) {
        if (seenIds.has(msg.id)) continue
        seenIds.add(msg.id)

        try {
          const msgRes = await fetch(
            `${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (!msgRes.ok) continue

          const msgData = await msgRes.json()
          const headers = msgData.payload?.headers || []
          const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value || ''
          const from = headers.find((h: { name: string }) => h.name === 'From')?.value || ''
          const date = headers.find((h: { name: string }) => h.name === 'Date')?.value || ''

          // Find PDF
          let pdfFilename: string | null = null
          let attachmentId: string | null = null
          function findPdf(parts: { filename?: string; mimeType?: string; body?: { attachmentId?: string }; parts?: unknown[] }[]) {
            for (const part of parts) {
              if (part.filename && (part.mimeType === 'application/pdf' || part.filename.toLowerCase().endsWith('.pdf')) && part.body?.attachmentId) {
                pdfFilename = part.filename
                attachmentId = part.body.attachmentId
                return
              }
              if (part.parts) findPdf(part.parts as typeof parts)
            }
          }
          if (msgData.payload?.parts) findPdf(msgData.payload.parts)

          // Find HTML body
          let htmlBody: string | null = null
          function findHtml(parts: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[]) {
            for (const part of parts) {
              if (part.mimeType === 'text/html' && part.body?.data) {
                htmlBody = Buffer.from(part.body.data, 'base64url').toString('utf-8')
                return
              }
              if (part.parts) findHtml(part.parts as typeof parts)
            }
          }
          if (msgData.payload?.parts) findHtml(msgData.payload.parts)
          else if (msgData.payload?.body?.data && msgData.payload?.mimeType === 'text/html') {
            htmlBody = Buffer.from(msgData.payload.body.data, 'base64url').toString('utf-8')
          }

          if (pdfFilename || htmlBody) {
            allMessages.push({ id: msg.id, subject, from, date, pdfFilename, htmlBody, attachmentId })
          }
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }

  return { messages: allMessages }
}
