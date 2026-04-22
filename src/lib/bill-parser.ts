/**
 * Bill PDF parsing using Claude Sonnet 4.6 via OpenRouter (or direct Anthropic).
 *
 * Extracts structured data from Israeli utility bill PDFs.
 * Falls back to Gemini if no Anthropic/OpenRouter key is configured.
 */

interface ParsedBill {
  bill_type: 'arnona' | 'iec' | 'water' | 'vaad_bayit' | 'internet' | 'gas' | 'other'
  amount_agorot: number
  due_date: string | null
  period_start: string | null
  period_end: string | null
  address: string | null
  account_holder: string | null
  account_number: string | null
  is_autopay: boolean
}

const EXTRACTION_PROMPT = `You are extracting data from an Israeli utility bill PDF. Return ONLY a valid JSON object, no markdown, no explanation.

{
  "bill_type": "iec|water|gas|internet|arnona|vaad_bayit|other",
  "amount": 148.74,
  "due_date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "address": "street and city",
  "account_holder": "name on the bill",
  "account_number": "account or contract number",
  "is_autopay": false
}

CRITICAL RULES FOR AMOUNT:
- The amount MUST be the FINAL TOTAL the customer needs to pay, INCLUDING VAT (מע"מ)
- Look for these Hebrew labels (in order of priority):
  1. "סה"כ לתשלום כולל מע"מ" (total including VAT)
  2. "סה"כ לתשלום" (total to pay)
  3. "יתרה לתשלום" (balance to pay)
  4. The bold/highlighted total amount, usually the largest number on the bill
- Do NOT use subtotals like "סה"כ צריכה" (consumption total) or individual line items
- If the bill says "אין לשלם" (do not pay) because it's on autopay (הוראת קבע), STILL extract the total amount but set is_autopay to true. Calculate it from subtotal + 18% VAT if needed.
- The amount should be in ILS (שקלים), as a decimal number like 148.74

BILL TYPE IDENTIFICATION:
- "iec" = חברת החשמל / Israel Electric Corporation
- "water" = הגיחון / Hagihon water company
- "internet" = בזק / Bezeq telecom
- "gas" = פזגז / Pazgas or סופרגז / Supergaz
- "vaad_bayit" = ועד בית / building committee
- "arnona" = ארנונה / municipal tax

ACCOUNT NUMBER:
- For הגיחון water: use חשבון חוזה number
- For IEC electricity: use מספר חשבון חוזה
- For פזגז gas: use מספר צרכן
- For בזק internet: use מספר קו / line number

If a field cannot be determined, use null.`

function parseAiResponse(text: string): ParsedBill | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])

    return {
      bill_type: parsed.bill_type || 'other',
      amount_agorot: parsed.amount ? Math.round(parsed.amount * 100) : 0,
      due_date: parsed.due_date || null,
      period_start: parsed.period_start || null,
      period_end: parsed.period_end || null,
      address: parsed.address || null,
      account_holder: parsed.account_holder || null,
      account_number: parsed.account_number || null,
      is_autopay: parsed.is_autopay || false,
    }
  } catch {
    return null
  }
}

/**
 * Parse a bill PDF using Claude Sonnet via OpenRouter.
 */
async function parseWithOpenRouter(pdfBase64: string, apiKey: string): Promise<ParsedBill | null> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT },
          {
            type: 'file',
            file: {
              filename: 'bill.pdf',
              file_data: `data:application/pdf;base64,${pdfBase64}`,
            },
          },
        ],
      }],
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    console.error('OpenRouter bill parse error:', response.status, await response.text())
    return null
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) return null

  return parseAiResponse(text)
}

/**
 * Parse a bill from HTML email body using Claude via OpenRouter.
 */
async function parseHtmlWithOpenRouter(
  htmlBody: string,
  subject: string,
  from: string,
  apiKey: string,
): Promise<ParsedBill | null> {
  const truncatedHtml = htmlBody.substring(0, 15000)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{
        role: 'user',
        content: `Extract billing information from this Israeli utility bill email.

Email subject: ${subject}
Email from: ${from}

Email HTML body:
${truncatedHtml}

${EXTRACTION_PROMPT}`,
      }],
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    console.error('OpenRouter HTML parse error:', response.status)
    return null
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) return null

  return parseAiResponse(text)
}

/**
 * Parse a bill using the best available AI provider.
 * Priority: OpenRouter (Claude Sonnet) → Gemini (fallback)
 */
export async function parseBillPdf(pdfBase64: string): Promise<ParsedBill | null> {
  const openRouterKey = process.env.OPENROUTER_API_KEY
  if (openRouterKey) {
    return parseWithOpenRouter(pdfBase64, openRouterKey)
  }

  // Fallback to Gemini
  const geminiKey = process.env.GEMINI_API_KEY
  if (geminiKey) {
    const { geminiGenerate } = await import('@/lib/gemini')
    const text = await geminiGenerate('lite', geminiKey, [{
      parts: [
        { text: EXTRACTION_PROMPT },
        { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
      ],
    }])
    if (!text) return null
    return parseAiResponse(text)
  }

  console.error('No AI provider configured for bill parsing (OPENROUTER_API_KEY or GEMINI_API_KEY)')
  return null
}

/**
 * Parse a bill from HTML email body using the best available AI provider.
 */
export async function parseBillHtml(
  htmlBody: string,
  subject: string,
  from: string,
): Promise<ParsedBill | null> {
  const openRouterKey = process.env.OPENROUTER_API_KEY
  if (openRouterKey) {
    return parseHtmlWithOpenRouter(htmlBody, subject, from, openRouterKey)
  }

  // Fallback to Gemini
  const geminiKey = process.env.GEMINI_API_KEY
  if (geminiKey) {
    const truncatedHtml = htmlBody.substring(0, 10000)
    const { geminiGenerate } = await import('@/lib/gemini')
    const text = await geminiGenerate('lite', geminiKey, [{
      parts: [{
        text: `Extract billing information from this Israeli utility bill email.
Email subject: ${subject}
Email from: ${from}
Email HTML body:
${truncatedHtml}

${EXTRACTION_PROMPT}`,
      }],
    }])
    if (!text) return null
    return parseAiResponse(text)
  }

  console.error('No AI provider configured for bill parsing')
  return null
}

export type { ParsedBill }
