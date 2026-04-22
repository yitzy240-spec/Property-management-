/**
 * Re-parse all bills with PDFs using the improved prompt.
 * Updates amounts in the database.
 *
 * Usage: node scripts/reparse-bills.mjs
 */

import { readFileSync } from 'fs';
try {
  const envFile = readFileSync('.env.local', 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* .env.local not found */ }

const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!SB_KEY || !SB_URL || !OPENROUTER_KEY) { console.error('Missing env vars'); process.exit(1); }

const sbHeaders = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };

const PROMPT = `You are extracting data from an Israeli utility bill PDF. Return ONLY a valid JSON object, no markdown, no explanation.

{
  "bill_type": "iec|water|gas|internet|arnona|vaad_bayit|other",
  "amount": 148.74,
  "due_date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "address": "street and city",
  "account_holder": "name on the bill",
  "account_number": "account or contract number",
  "is_autopay": false,
  "is_bill": true
}

CRITICAL RULES FOR AMOUNT:
- The amount MUST be the FINAL TOTAL the customer needs to pay, INCLUDING VAT
- Look for these Hebrew labels (in order of priority):
  1. "סה"כ לתשלום כולל מע"מ" (total including VAT)
  2. "סה"כ לתשלום" (total to pay)
  3. "יתרה לתשלום" (balance to pay)
  4. The bold/highlighted total amount
- Do NOT use subtotals like "סה"כ צריכה" or individual line items
- If the bill says "אין לשלם" because it's on autopay, STILL extract the total but set is_autopay=true. Calculate from subtotal + 18% VAT if the total isn't printed.
- Amount in ILS as decimal like 148.74

IS_BILL: Set to false if this document is NOT an actual bill/invoice — e.g. it's a notification letter (הודעה), consumption alert, voting form, or any document without a payment amount. Set to true for actual bills/invoices.

BILL TYPE: "iec"=חברת החשמל, "water"=הגיחון, "internet"=בזק, "gas"=פזגז/סופרגז, "vaad_bayit"=ועד בית, "arnona"=ארנונה

ACCOUNT NUMBER: water=חשבון חוזה, iec=מספר חשבון חוזה, gas=מספר צרכן, internet=מספר קו

If a field cannot be determined, use null.`;

async function parsePdf(pdfPath) {
  const pdfRes = await fetch(`${SB_URL}/storage/v1/object/documents/${pdfPath}`, { headers: sbHeaders });
  if (!pdfRes.ok) return null;
  const pdfBuffer = await pdfRes.arrayBuffer();
  const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

  if (!aiRes.ok) return null;
  const aiData = await aiRes.json();
  const text = aiData.choices?.[0]?.message?.content || '';
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match[0]);
  } catch { return null; }
}

async function main() {
  // Get all bills with PDFs
  const billsRes = await fetch(`${SB_URL}/rest/v1/bills?pdf_storage_path=not.is.null&select=id,bill_type,amount_agorot,pdf_storage_path,billing_period_start,billing_period_end,ai_parsed_data&order=bill_type&limit=200`, { headers: sbHeaders });
  const bills = await billsRes.json();
  console.log(`Re-parsing ${bills.length} bills...\n`);

  let updated = 0, notBills = 0, failed = 0, unchanged = 0;

  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    const parsed = await parsePdf(bill.pdf_storage_path);

    if (!parsed) {
      console.log(`[${i+1}/${bills.length}] FAILED: ${bill.id.substring(0,8)} (PDF download or parse error)`);
      failed++;
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    if (parsed.is_bill === false) {
      console.log(`[${i+1}/${bills.length}] NOT A BILL: ${bill.id.substring(0,8)} — deleting`);
      await fetch(`${SB_URL}/rest/v1/bills?id=eq.${bill.id}`, { method: 'DELETE', headers: sbHeaders });
      notBills++;
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    const newAmount = parsed.amount ? Math.round(parsed.amount * 100) : 0;
    const oldAmount = bill.amount_agorot;

    // Update bill with new parsed data
    const updateBody = {
      amount_agorot: newAmount,
      bill_type: parsed.bill_type || bill.bill_type,
      due_date: parsed.due_date || null,
      billing_period_start: parsed.period_start || bill.billing_period_start,
      billing_period_end: parsed.period_end || bill.billing_period_end,
      ai_parsed_data: {
        ...bill.ai_parsed_data,
        ...parsed,
        amount_agorot: newAmount,
        reparsed_at: new Date().toISOString(),
      },
    };

    await fetch(`${SB_URL}/rest/v1/bills?id=eq.${bill.id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(updateBody),
    });

    if (oldAmount !== newAmount) {
      console.log(`[${i+1}/${bills.length}] UPDATED: ₪${(oldAmount/100).toFixed(2)} → ₪${(newAmount/100).toFixed(2)} | ${parsed.bill_type} | ${(parsed.account_holder||'').substring(0,20)}`);
      updated++;
    } else {
      unchanged++;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Also delete duplicate PDF bills
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
  console.log(`  Failed (PDF error): ${failed}`);
  console.log('=============================');
}

main().catch(console.error);
