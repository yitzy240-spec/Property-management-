/**
 * Fix remaining ₪0 bills: Hebrew filename PDFs + HTML-only emails
 * Usage: node scripts/fix-remaining-bills.mjs
 */

import { readFileSync } from 'fs';
import { webcrypto } from 'crypto';
const subtle = webcrypto.subtle;

try {
  const envFile = readFileSync('.env.local', 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {}

const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!SB_KEY || !SB_URL || !OPENROUTER_KEY) { console.error('Missing env vars'); process.exit(1); }

const sbH = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };

const PDF_PROMPT = `You are extracting data from an Israeli utility bill PDF. Return ONLY a valid JSON object, no markdown, no explanation.

{"bill_type":"iec|water|gas|internet|arnona|vaad_bayit|other","amount":148.74,"due_date":"YYYY-MM-DD","period_start":"YYYY-MM-DD","period_end":"YYYY-MM-DD","address":"street and city","account_holder":"name on the bill","account_number":"account or contract number","is_autopay":false,"is_bill":true}

CRITICAL: amount = FINAL TOTAL INCLUDING VAT. Look for "סה"כ לתשלום כולל מע"מ" or "סה"כ לתשלום" or "יתרה לתשלום". NOT subtotals. If autopay, still extract total, set is_autopay=true. is_bill=false if this is a notification letter, not an invoice. If a field cannot be determined, use null.`;

const HTML_PROMPT = `You are extracting data from an Israeli utility bill email. Return ONLY a valid JSON object, no markdown, no explanation.

{"bill_type":"iec|water|gas|internet|arnona|vaad_bayit|other","amount":148.74,"due_date":"YYYY-MM-DD","period_start":"YYYY-MM-DD","period_end":"YYYY-MM-DD","address":"street and city","account_holder":"name on the bill","account_number":"account or contract number"}

CRITICAL: amount = FINAL TOTAL INCLUDING VAT. Look for "סה"כ לתשלום כולל מע"מ". If a field cannot be determined, use null.`;

async function deriveKey(s) {
  return subtle.importKey('raw', new TextEncoder().encode(s).slice(0,32), {name:'AES-GCM'}, false, ['decrypt']);
}
async function decrypt(e) {
  const k = await deriveKey(ENCRYPTION_KEY);
  const c = new Uint8Array(Buffer.from(e, 'base64'));
  return new TextDecoder().decode(await subtle.decrypt({name:'AES-GCM', iv:c.slice(0,12), tagLength:128}, k, c.slice(12)));
}

function parseResponse(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

async function callAI(messages) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` },
    body: JSON.stringify({ model: 'anthropic/claude-sonnet-4-6', messages, max_tokens: 1024 }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return parseResponse(d.choices?.[0]?.message?.content || '');
}

async function updateBill(billId, parsed, extra) {
  const newAmount = parsed.amount ? Math.round(parsed.amount * 100) : 0;
  await fetch(`${SB_URL}/rest/v1/bills?id=eq.${billId}`, {
    method: 'PATCH',
    headers: { ...sbH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount_agorot: newAmount,
      bill_type: parsed.bill_type || undefined,
      due_date: parsed.due_date || null,
      billing_period_start: parsed.period_start || undefined,
      billing_period_end: parsed.period_end || undefined,
      ai_parsed_data: { ...extra, ...parsed, amount_agorot: newAmount, reparsed_at: new Date().toISOString() },
    }),
  });
  return newAmount;
}

async function main() {
  // === 1. Fix Hebrew filename PDFs ===
  const pdfRes = await fetch(`${SB_URL}/rest/v1/bills?amount_agorot=eq.0&pdf_storage_path=not.is.null&select=id,bill_type,pdf_storage_path`, { headers: sbH });
  const pdfBills = await pdfRes.json();
  console.log(`=== HEBREW FILENAME PDFs: ${pdfBills.length} ===\n`);

  for (const bill of pdfBills) {
    const encodedPath = bill.pdf_storage_path.split('/').map(p => encodeURIComponent(p)).join('/');
    const dlRes = await fetch(`${SB_URL}/storage/v1/object/documents/${encodedPath}`, { headers: sbH });

    if (!dlRes.ok) { console.log(`STILL FAILED: ${bill.id.substring(0,8)} (${dlRes.status})`); continue; }

    const buf = await dlRes.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');

    const parsed = await callAI([{ role: 'user', content: [
      { type: 'text', text: PDF_PROMPT },
      { type: 'file', file: { filename: 'bill.pdf', file_data: `data:application/pdf;base64,${b64}` } }
    ]}]);

    if (!parsed) { console.log(`AI FAILED: ${bill.id.substring(0,8)}`); continue; }

    if (parsed.is_bill === false) {
      await fetch(`${SB_URL}/rest/v1/bills?id=eq.${bill.id}`, { method: 'DELETE', headers: sbH });
      console.log(`NOT A BILL (deleted): ${bill.id.substring(0,8)}`);
    } else {
      const amt = await updateBill(bill.id, parsed, {});
      console.log(`FIXED: ${bill.id.substring(0,8)} ₪${(amt/100).toFixed(2)} ${parsed.bill_type} ${(parsed.account_holder||'').substring(0,20)}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // === 2. Fix HTML-only bills ===
  const htmlRes = await fetch(`${SB_URL}/rest/v1/bills?amount_agorot=eq.0&pdf_storage_path=is.null&select=id,bill_type,gmail_message_id,ai_parsed_data`, { headers: sbH });
  const htmlBills = await htmlRes.json();
  console.log(`\n=== HTML-ONLY BILLS: ${htmlBills.length} ===\n`);

  if (htmlBills.length > 0 && GMAIL_CLIENT_ID) {
    const tokRes = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.gmail_tokens&select=value`, { headers: sbH });
    const tokData = await tokRes.json();
    const tokens = JSON.parse(await decrypt(tokData[0].value));
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: tokens.refresh_token, client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, grant_type: 'refresh_token' }),
    });
    const { access_token } = await refreshRes.json();

    if (!access_token) { console.log('Gmail token refresh failed'); } else {
      for (const bill of htmlBills) {
        if (!bill.gmail_message_id) { console.log(`NO MSG ID: ${bill.id.substring(0,8)}`); continue; }

        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${bill.gmail_message_id}?format=full`, {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        if (!msgRes.ok) { console.log(`GMAIL FAILED: ${bill.id.substring(0,8)}`); continue; }
        const msg = await msgRes.json();

        const hdrs = msg.payload?.headers || [];
        const subject = hdrs.find(x => x.name === 'Subject')?.value || '';
        const from = hdrs.find(x => x.name === 'From')?.value || '';

        let htmlBody = null;
        const findHtml = (parts) => {
          for (const p of (parts || [])) {
            if (p.mimeType === 'text/html' && p.body?.data) {
              htmlBody = Buffer.from(p.body.data, 'base64url').toString('utf-8');
              return;
            }
            if (p.parts) findHtml(p.parts);
          }
        };
        if (msg.payload?.parts) findHtml(msg.payload.parts);
        else if (msg.payload?.body?.data && msg.payload?.mimeType === 'text/html') {
          htmlBody = Buffer.from(msg.payload.body.data, 'base64url').toString('utf-8');
        }

        if (!htmlBody) { console.log(`NO HTML: ${bill.id.substring(0,8)}`); continue; }

        const parsed = await callAI([{ role: 'user', content: `Extract billing info from this email.\nSubject: ${subject}\nFrom: ${from}\nHTML:\n${htmlBody.substring(0, 15000)}\n\n${HTML_PROMPT}` }]);

        if (!parsed) { console.log(`AI FAILED: ${bill.id.substring(0,8)}`); continue; }

        const amt = await updateBill(bill.id, parsed, bill.ai_parsed_data || {});
        console.log(`FIXED: ${bill.id.substring(0,8)} ₪${(amt/100).toFixed(2)} ${parsed.bill_type} ${subject.substring(0,40)}`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // === Final count ===
  const finalRes = await fetch(`${SB_URL}/rest/v1/bills?select=id,amount_agorot`, { headers: { ...sbH, 'Prefer': 'count=exact' } });
  const allBills = await finalRes.json();
  const zeros = allBills.filter(b => b.amount_agorot === 0).length;
  console.log('\n=============================');
  console.log('FINAL STATE');
  console.log(`Total bills: ${allBills.length}`);
  console.log(`With amounts: ${allBills.length - zeros}`);
  console.log(`Still ₪0: ${zeros}`);
  console.log('=============================');
}

main().catch(console.error);
