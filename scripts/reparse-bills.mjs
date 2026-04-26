/**
 * Re-parse all bills using text extraction + Claude.
 * Pipeline: PDF → pdf-parse (text) → Claude Sonnet → update DB
 *
 * Usage: node scripts/reparse-bills.mjs
 */

import { readFileSync } from 'fs';
import pdfParse from 'pdf-parse';

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
if (!SB_KEY || !SB_URL || !OPENROUTER_KEY) { console.error('Missing env vars'); process.exit(1); }

const sbHeaders = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };

const PROMPT = `Extract from this Israeli utility bill. Return ONLY valid JSON, no markdown.

{"bill_type":"iec|water|gas|internet|arnona|vaad_bayit|other","amount":148.74,"due_date":"YYYY-MM-DD","period_start":"YYYY-MM-DD","period_end":"YYYY-MM-DD","address":"street and city","account_holder":"name on the bill","account_number":"account or contract number","is_autopay":false,"is_bill":true}

CRITICAL — AMOUNT:
- MUST be the FINAL TOTAL INCLUDING VAT
- Look for "סה"כ לתשלום כולל מע"מ" — this is always the correct total
- If that label isn't present, look for "סה"כ לתשלום" or "סה"כ כולל מע"מ"
- Do NOT use "סה"כ צריכה" or "סה"כ ללא מע"מ" — those are subtotals
- If "לא לתשלום" or "אין לשלם" (autopay), still extract the total, set is_autopay=true
- Amount as decimal ILS number like 148.74

IS_BILL: false if not an actual invoice (notification letter, voting form, consumption alert)
BILL TYPE: iec=חברת החשמל, water=הגיחון, internet=בזק, gas=פזגז/סופרגז, vaad_bayit=ועד בית, arnona=ארנונה
ACCOUNT NUMBER: water=חשבון חוזה, iec=מספר חשבון חוזה, gas=מספר צרכן, internet=מספר קו
If a field cannot be determined, use null.`;

function parseResponse(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

async function parsePdf(pdfPath) {
  // Download PDF
  const encodedPath = pdfPath.split('/').map(p => encodeURIComponent(p)).join('/');
  const pdfRes = await fetch(`${SB_URL}/storage/v1/object/documents/${encodedPath}`, { headers: sbHeaders });
  if (!pdfRes.ok) return { error: 'download_failed' };
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  // Extract text
  let extractedText = null;
  try {
    const result = await pdfParse(pdfBuffer);
    if (result.text.trim().length > 50) extractedText = result.text;
  } catch {}

  // Send to Claude — text if available, raw PDF as fallback
  let aiResponse;
  if (extractedText) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-6',
        messages: [{ role: 'user', content: `Extracted text from an Israeli utility bill:\n\n${extractedText}\n\n${PROMPT}` }],
        max_tokens: 1024,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      aiResponse = d.choices?.[0]?.message?.content;
    }
  }

  if (!aiResponse) {
    // Fallback to PDF vision
    const pdfBase64 = pdfBuffer.toString('base64');
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
    if (r.ok) {
      const d = await r.json();
      aiResponse = d.choices?.[0]?.message?.content;
    }
  }

  if (!aiResponse) return { error: 'ai_failed' };
  const parsed = parseResponse(aiResponse);
  if (!parsed) return { error: 'parse_failed' };
  return { parsed, method: extractedText ? 'text' : 'vision' };
}

async function main() {
  const billsRes = await fetch(`${SB_URL}/rest/v1/bills?pdf_storage_path=not.is.null&select=id,bill_type,amount_agorot,pdf_storage_path,billing_period_start,billing_period_end,ai_parsed_data&order=bill_type&limit=200`, { headers: sbHeaders });
  const bills = await billsRes.json();
  console.log(`Re-parsing ${bills.length} bills with text extraction pipeline...\n`);

  let updated = 0, notBills = 0, failed = 0, unchanged = 0;

  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    const result = await parsePdf(bill.pdf_storage_path);

    if (result.error) {
      console.log(`[${i+1}/${bills.length}] FAILED: ${bill.id.substring(0,8)} (${result.error})`);
      failed++;
      await new Promise(r => setTimeout(r, 300));
      continue;
    }

    const { parsed, method } = result;

    if (parsed.is_bill === false) {
      await fetch(`${SB_URL}/rest/v1/bills?id=eq.${bill.id}`, { method: 'DELETE', headers: sbHeaders });
      console.log(`[${i+1}/${bills.length}] NOT A BILL (deleted): ${bill.id.substring(0,8)} [${method}]`);
      notBills++;
      await new Promise(r => setTimeout(r, 300));
      continue;
    }

    const newAmount = parsed.amount ? Math.round(parsed.amount * 100) : 0;
    const oldAmount = bill.amount_agorot;

    await fetch(`${SB_URL}/rest/v1/bills?id=eq.${bill.id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_agorot: newAmount,
        bill_type: parsed.bill_type || bill.bill_type,
        due_date: parsed.due_date || null,
        billing_period_start: parsed.period_start || bill.billing_period_start,
        billing_period_end: parsed.period_end || bill.billing_period_end,
        ai_parsed_data: {
          ...bill.ai_parsed_data,
          ...parsed,
          amount_agorot: newAmount,
          extraction_method: method,
          reparsed_at: new Date().toISOString(),
        },
      }),
    });

    if (oldAmount !== newAmount) {
      console.log(`[${i+1}/${bills.length}] UPDATED: ₪${(oldAmount/100).toFixed(2)} → ₪${(newAmount/100).toFixed(2)} | ${parsed.bill_type} | ${(parsed.account_holder||'').substring(0,20)} [${method}]`);
      updated++;
    } else {
      unchanged++;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Remove duplicates
  const allBills = await fetch(`${SB_URL}/rest/v1/bills?pdf_storage_path=not.is.null&select=id,pdf_storage_path,created_at&order=pdf_storage_path,created_at`, { headers: sbHeaders }).then(r => r.json());
  const seen = new Set();
  let dupes = 0;
  for (const b of allBills) {
    if (seen.has(b.pdf_storage_path)) {
      await fetch(`${SB_URL}/rest/v1/bills?id=eq.${b.id}`, { method: 'DELETE', headers: sbHeaders });
      dupes++;
    } else {
      seen.add(b.pdf_storage_path);
    }
  }

  console.log('\n=============================');
  console.log('RE-PARSE COMPLETE');
  console.log(`  Updated amounts: ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Not actual bills (deleted): ${notBills}`);
  console.log(`  Duplicate PDFs (deleted): ${dupes}`);
  console.log(`  Failed: ${failed}`);
  console.log('=============================');
}

main().catch(console.error);
