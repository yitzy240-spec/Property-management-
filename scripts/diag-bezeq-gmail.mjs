// One-shot diagnostic: list every Bezeq email in the scraped Gmail
// inbox over the last N days and show (a) which Gmail labels are
// applied, (b) whether the email has a PDF attachment, (c) whether
// our `bills` table already has a row for it.
//
// Run: node scripts/diag-bezeq-gmail.mjs [days=14]

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { webcrypto as crypto } from 'node:crypto'

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^=]+)=(.*)$/)
  if (m) a[m[1]] = m[2]
  return a
}, {})

const days = Number(process.argv[2] ?? 14)

async function deriveKey(secret) {
  const enc = new TextEncoder()
  return crypto.subtle.importKey('raw', enc.encode(secret).slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function decrypt(encrypted, secret) {
  const key = await deriveKey(secret)
  const combined = new Uint8Array(Buffer.from(encrypted, 'base64'))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  return res.json()
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: tokenSetting } = await supabase.from('app_settings').select('value').eq('key', 'gmail_tokens').single()
if (!tokenSetting) { console.error('No gmail_tokens row'); process.exit(1) }
const tokens = JSON.parse(await decrypt(tokenSetting.value, env.ENCRYPTION_KEY))
let accessToken = tokens.access_token
if (tokens.expires_at <= Date.now() + 60_000) {
  console.error('Refreshing access token...')
  const refreshed = await refreshAccessToken(tokens.refresh_token)
  accessToken = refreshed.access_token
}

// Fetch label name map (id → name)
const labelsRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
  headers: { Authorization: `Bearer ${accessToken}` },
})
const labelsData = await labelsRes.json()
const labelIdToName = {}
for (const l of labelsData.labels ?? []) labelIdToName[l.id] = l.name

// Search Bezeq emails
const query = `from:bezeq_mail@bezeq.co.il newer_than:${days}d`
const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`, {
  headers: { Authorization: `Bearer ${accessToken}` },
})
const listData = await listRes.json()
const messages = listData.messages ?? []
console.log(`\nGmail inbox (Ariel) — ${messages.length} Bezeq messages in last ${days} days\n`)

const ids = messages.map(m => m.id)
const { data: dbRows } = await supabase.from('bills').select('id, gmail_message_id, status, amount_agorot, ai_parsed_data, anomaly_note').in('gmail_message_id', ids.length ? ids : ['__none__'])
const inDb = new Map((dbRows ?? []).map(r => [r.gmail_message_id, r]))

for (const m of messages) {
  const fullRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const meta = await fullRes.json()
  const subject = meta.payload?.headers?.find(h => h.name === 'Subject')?.value ?? ''
  const date = meta.payload?.headers?.find(h => h.name === 'Date')?.value ?? ''
  const labelNames = (meta.labelIds ?? []).map(id => labelIdToName[id] ?? id).filter(n => n.startsWith('Bill/') || n === 'INBOX' || n === 'STARRED' || n.startsWith('CATEGORY_'))

  // Has attachment?
  const fullRes2 = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const full = await fullRes2.json()
  let hasPdf = false
  function findPdf(parts) {
    for (const p of parts ?? []) {
      if (p.filename && (p.mimeType === 'application/pdf' || p.filename.toLowerCase().endsWith('.pdf')) && p.body?.attachmentId) hasPdf = true
      if (p.parts) findPdf(p.parts)
    }
  }
  findPdf(full.payload?.parts)

  const dbRow = inDb.get(m.id)
  const dbStatus = dbRow ? `${dbRow.status} (${(dbRow.amount_agorot ?? 0) / 100} ILS)` : 'NOT IN DB'

  console.log('—'.repeat(60))
  console.log('Message ID:', m.id)
  console.log('Date:      ', date)
  console.log('Subject:   ', subject)
  console.log('Labels:    ', labelNames.join(', '))
  console.log('Has PDF:   ', hasPdf)
  console.log('In our DB: ', dbStatus)
  if (dbRow?.anomaly_note) console.log('DB note:   ', dbRow.anomaly_note)
}
