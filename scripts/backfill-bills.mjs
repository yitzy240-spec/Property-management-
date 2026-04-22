/**
 * One-time backfill: crawl all Bill/* Gmail labels, parse bills with Claude Sonnet,
 * and populate the bills table with historical data.
 *
 * Usage: node scripts/backfill-bills.mjs
 */

import { webcrypto } from 'crypto';
const subtle = webcrypto.subtle;

// Load env vars from .env.local
import { readFileSync } from 'fs';
try {
  const envFile = readFileSync('.env.local', 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* .env.local not found, use existing env */ }

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!ENCRYPTION_KEY || !GMAIL_CLIENT_ID || !SB_KEY || !OPENROUTER_KEY) {
  console.error('Missing required env vars. Run from project root with .env.local present.');
  process.exit(1);
}
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1';

const LABEL_TO_PROPERTY = {
  'Bill/Agripas 6':   '22222222-aaaa-0000-0000-000000000002',
  'Bill/Agripas 8':   '22222222-aaaa-0000-0000-000000000003',
  'Bill/Jtower':      'dace8043-80ad-4e9d-a530-7e3c3ba0efec',
  'Bill/KH APT #3':   '22222222-aaaa-0000-0000-000000000005',
  'Bill/KH APT #26':  'b26a5f8a-cb28-4174-9a87-62938eea066b',
  'Bill/Mesila':      'cb5a733b-24b6-4e3a-bf1d-972dcec63e3a',
  'Bill/Savyon View': '22222222-aaaa-0000-0000-000000000004',
};

const PROMPT = `Extract from this Israeli utility bill. Return ONLY valid JSON, no markdown:
{"bill_type": "iec|water|gas|internet|arnona|vaad_bayit|other", "amount": 123.45, "due_date": "YYYY-MM-DD", "period_start": "YYYY-MM-DD", "period_end": "YYYY-MM-DD", "address": "...", "account_holder": "...", "account_number": "..."}
Rules: amount = total due in ILS. bill_type: iec=electricity, water=hagihon, internet=bezeq, gas=pazgas, vaad_bayit=building committee, arnona=municipal tax. For water bills: account_number = contract account number. If unknown, use null.`;

const sbHeaders = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };

async function deriveKey(secret) {
  return subtle.importKey('raw', new TextEncoder().encode(secret).slice(0, 32), { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decrypt(encrypted) {
  const key = await deriveKey(ENCRYPTION_KEY);
  const combined = new Uint8Array(Buffer.from(encrypted, 'base64'));
  return new TextDecoder().decode(
    await subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12), tagLength: 128 }, key, combined.slice(12))
  );
}

async function getGmailToken() {
  const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.gmail_tokens&select=value`, { headers: sbHeaders });
  const data = await res.json();
  const tokens = JSON.parse(await decrypt(data[0].value));
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: tokens.refresh_token, client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, grant_type: 'refresh_token' }),
  });
  const { access_token } = await tokenRes.json();
  return access_token;
}

function parseAiResponse(text) {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    return {
      bill_type: p.bill_type || 'other',
      amount_agorot: p.amount ? Math.round(p.amount * 100) : 0,
      due_date: p.due_date || null,
      period_start: p.period_start || null,
      period_end: p.period_end || null,
      address: p.address || null,
      account_holder: p.account_holder || null,
      account_number: p.account_number || null,
    };
  } catch { return null; }
}

async function aiParsePdf(pdfBase64) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'file', file: { filename: 'bill.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` } }
      ]}],
      max_tokens: 1024,
    }),
  });
  if (!r.ok) { console.log('    AI PDF error:', r.status); return null; }
  const d = await r.json();
  return parseAiResponse(d.choices?.[0]?.message?.content || '');
}

async function aiParseHtml(html, subject, from) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: `Extract billing info from this email.\nSubject: ${subject}\nFrom: ${from}\nHTML:\n${html.substring(0, 15000)}\n\n${PROMPT}` }],
      max_tokens: 1024,
    }),
  });
  if (!r.ok) { console.log('    AI HTML error:', r.status); return null; }
  const d = await r.json();
  return parseAiResponse(d.choices?.[0]?.message?.content || '');
}

function findPdf(parts) {
  for (const p of (parts || [])) {
    if (p.filename && p.body?.attachmentId && (p.mimeType === 'application/pdf' || p.filename?.endsWith('.pdf'))) {
      return { filename: p.filename, attachmentId: p.body.attachmentId };
    }
    if (p.parts) {
      const found = findPdf(p.parts);
      if (found) return found;
    }
  }
  return null;
}

function findHtml(payload) {
  function search(parts) {
    for (const p of (parts || [])) {
      if (p.mimeType === 'text/html' && p.body?.data) {
        return Buffer.from(p.body.data, 'base64url').toString('utf-8');
      }
      if (p.parts) {
        const found = search(p.parts);
        if (found) return found;
      }
    }
    return null;
  }
  const fromParts = search(payload.parts);
  if (fromParts) return fromParts;
  if (payload.body?.data && payload.mimeType === 'text/html') {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  return null;
}

async function main() {
  console.log('Starting bill backfill...\n');

  const accessToken = await getGmailToken();
  if (!accessToken) { console.log('Failed to get Gmail token'); return; }

  // Load utility accounts
  const uaRes = await fetch(`${SB_URL}/rest/v1/property_utility_accounts?select=property_id,utility_type,account_number`, { headers: sbHeaders });
  const utilityAccounts = await uaRes.json();

  // Get labels
  const labelsRes = await fetch(`${GMAIL_BASE}/users/me/labels`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const labelsData = await labelsRes.json();
  const billLabels = labelsData.labels.filter(l => LABEL_TO_PROPERTY[l.name]);

  let totalParsed = 0, totalSkipped = 0, totalErrors = 0, totalNoContent = 0;

  for (const label of billLabels) {
    const propertyId = LABEL_TO_PROPERTY[label.name];
    console.log(`\n=== ${label.name} ===`);

    // Fetch all message IDs (paginate)
    let allMsgIds = [];
    let pageToken = null;
    do {
      const url = `${GMAIL_BASE}/users/me/messages?labelIds=${label.id}&maxResults=100${pageToken ? '&pageToken=' + pageToken : ''}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const d = await r.json();
      allMsgIds = allMsgIds.concat(d.messages || []);
      pageToken = d.nextPageToken || null;
    } while (pageToken);

    console.log(`  ${allMsgIds.length} emails found`);

    for (let i = 0; i < allMsgIds.length; i++) {
      const msgId = allMsgIds[i].id;

      // Skip if already in DB
      const existRes = await fetch(`${SB_URL}/rest/v1/bills?gmail_message_id=eq.${msgId}&select=id&limit=1`, { headers: sbHeaders });
      const existing = await existRes.json();
      if (existing.length > 0) { totalSkipped++; continue; }

      // Fetch full message
      const msgRes = await fetch(`${GMAIL_BASE}/users/me/messages/${msgId}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!msgRes.ok) { totalErrors++; continue; }
      const msg = await msgRes.json();

      const hdrs = msg.payload?.headers || [];
      const subject = hdrs.find(h => h.name === 'Subject')?.value || '';
      const from = hdrs.find(h => h.name === 'From')?.value || '';

      const pdf = findPdf(msg.payload?.parts);
      const htmlBody = findHtml(msg.payload);

      if (!pdf && !htmlBody) { totalNoContent++; continue; }

      // Download PDF
      let pdfBase64 = null;
      let storagePath = null;
      if (pdf) {
        try {
          const aRes = await fetch(`${GMAIL_BASE}/users/me/messages/${msgId}/attachments/${pdf.attachmentId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (aRes.ok) {
            const aData = await aRes.json();
            pdfBase64 = aData.data.replace(/-/g, '+').replace(/_/g, '/');
            storagePath = `bills/${msgId}_${pdf.filename}`;
            const pdfBuffer = Buffer.from(aData.data, 'base64url');
            await fetch(`${SB_URL}/storage/v1/object/documents/${storagePath}`, {
              method: 'POST',
              headers: { ...sbHeaders, 'Content-Type': 'application/pdf' },
              body: pdfBuffer,
            });
          }
        } catch { /* PDF download failed */ }
      }

      // AI parse
      let parsed = null;
      try {
        if (pdfBase64) {
          parsed = await aiParsePdf(pdfBase64);
        } else if (htmlBody) {
          parsed = await aiParseHtml(htmlBody, subject, from);
        }
      } catch { /* AI failed */ }

      // Property routing
      let finalPropertyId = propertyId;
      let matchMethod = 'gmail_label';
      if (parsed?.account_number) {
        const acctMatch = utilityAccounts.find(ua => ua.account_number === parsed.account_number);
        if (acctMatch) {
          if (acctMatch.property_id !== propertyId) {
            finalPropertyId = acctMatch.property_id;
            matchMethod = 'account_number_override';
          } else {
            matchMethod = 'gmail_label+account_confirmed';
          }
        }
      }

      // Insert bill
      const billRes = await fetch(`${SB_URL}/rest/v1/bills`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          property_id: finalPropertyId,
          bill_type: parsed?.bill_type || 'other',
          amount_agorot: parsed?.amount_agorot || 0,
          due_date: parsed?.due_date || null,
          billing_period_start: parsed?.period_start || null,
          billing_period_end: parsed?.period_end || null,
          status: 'pending_review',
          pdf_storage_path: storagePath,
          gmail_message_id: msgId,
          ai_parsed_data: { ...parsed, match_method: matchMethod, gmail_label: label.name, email_subject: subject, email_from: from },
        }),
      });

      if (billRes.ok) {
        totalParsed++;
        const amt = parsed?.amount_agorot ? '₪' + (parsed.amount_agorot / 100).toFixed(2) : '₪?';
        const holder = (parsed?.account_holder || '').substring(0, 25);
        console.log(`  [${i + 1}/${allMsgIds.length}] ${parsed?.bill_type || '?'} ${amt} ${holder}`);
      } else {
        totalErrors++;
        const errText = await billRes.text();
        console.log(`  [${i + 1}] INSERT ERROR: ${billRes.status} ${errText.substring(0, 100)}`);
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n=============================');
  console.log(`BACKFILL COMPLETE`);
  console.log(`  Parsed & inserted: ${totalParsed}`);
  console.log(`  Skipped (already in DB): ${totalSkipped}`);
  console.log(`  No content (no PDF/HTML): ${totalNoContent}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('=============================');
}

main().catch(console.error);
