// Search Gmail for emails labeled `Bill/Agripas 8` from the vaad
// management company and report which are in our DB.
//
// Run: node scripts/diag-vaad-agripas8.mjs

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { webcrypto as crypto } from 'node:crypto'

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^=]+)=(.*)$/)
  if (m) a[m[1]] = m[2]
  return a
}, {})

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
  return res.json()
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: tokenSetting } = await supabase.from('app_settings').select('value').eq('key', 'gmail_tokens').single()
const tokens = JSON.parse(await decrypt(tokenSetting.value, env.ENCRYPTION_KEY))
let accessToken = tokens.access_token
if (tokens.expires_at <= Date.now() + 60_000) {
  const refreshed = await refreshAccessToken(tokens.refresh_token)
  accessToken = refreshed.access_token
}

// Look up the Bill/Agripas 8 label ID
const labelsRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
  headers: { Authorization: `Bearer ${accessToken}` },
})
const labelsData = await labelsRes.json()
const a8 = labelsData.labels.find(l => l.name === 'Bill/Agripas 8')
console.log('Bill/Agripas 8 label id:', a8?.id)

// Search messages with this label, no date restriction
let allMessages = []
let pageToken = undefined
do {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  url.searchParams.set('labelIds', a8.id)
  url.searchParams.set('maxResults', '100')
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await res.json()
  allMessages = allMessages.concat(data.messages ?? [])
  pageToken = data.nextPageToken
} while (pageToken)

console.log(`\nTotal Bill/Agripas 8 messages in Gmail: ${allMessages.length}`)

// Diff against DB
const ids = allMessages.map(m => m.id)
const { data: dbRows } = await supabase.from('bills').select('gmail_message_id').in('gmail_message_id', ids.length ? ids : ['__none__'])
const inDb = new Set((dbRows ?? []).map(r => r.gmail_message_id))

const notInDb = allMessages.filter(m => !inDb.has(m.id))
console.log(`Already in DB: ${ids.length - notInDb.length}`)
console.log(`NOT in DB: ${notInDb.length}`)

if (notInDb.length === 0) { process.exit(0) }

// Show subject + sender + has-PDF for the missing ones
console.log('\nMissing messages:')
for (const m of notInDb.slice(0, 50)) {
  const fullRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const meta = await fullRes.json()
  const subject = meta.payload?.headers?.find(h => h.name === 'Subject')?.value ?? ''
  const from = meta.payload?.headers?.find(h => h.name === 'From')?.value ?? ''
  const date = meta.payload?.headers?.find(h => h.name === 'Date')?.value ?? ''
  console.log(`  ${m.id} | ${date.slice(5, 16)} | ${from.slice(0, 30)} | ${subject.slice(0, 60)}`)
}
