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
}

const EXTRACTION_PROMPT = `Extract the following from this Israeli utility bill. Return ONLY valid JSON, no markdown formatting.

{
  "bill_type": "arnona|iec|water|vaad_bayit|internet|gas|other",
  "amount": 123.45,
  "due_date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "address": "the property address on the bill",
  "account_holder": "name of person/entity (שם בעל החשבון)",
  "account_number": "account/contract number (מספר חשבון חוזה)"
}

Rules:
- bill_type: "iec" for חברת חשמל, "water" for הגיחון, "internet" for בזק, "gas" for פזגז/סופרגז, "vaad_bayit" for ועד בית, "arnona" for עירייה
- amount: the total amount due in ILS (סה"כ לתשלום). Look for the final total, not subtotals. Must be a number like 842.50
- For הגיחון water bills, account_number should be the חשבון חוזה number
- For IEC bills, account_number should be the מספר חשבון חוזה
- If you cannot determine a field, use null`

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
