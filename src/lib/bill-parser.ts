/**
 * Bill PDF parsing pipeline:
 * 1. Extract text from PDF using pdf-parse (fast, exact, no vision cost)
 * 2. Send extracted text to Claude Sonnet for structured extraction
 * 3. If text extraction fails (image-only PDF), fall back to sending the raw PDF
 *
 * This approach is more accurate because Claude works with exact text
 * rather than trying to visually read numbers from a PDF image.
 */

// Import the implementation file directly. The default `pdf-parse` index file
// runs a debug self-test on module load that reads a fixture PDF from disk —
// fine in Node but throws ENOENT in serverless bundles. See
// https://gitlab.com/autokent/pdf-parse/-/issues/24
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no types for the inner path
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

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
  is_bill: boolean
}

const EXTRACTION_PROMPT = `Extract from this Israeli utility bill. Return ONLY valid JSON, no markdown.

{"bill_type":"iec|water|gas|internet|arnona|vaad_bayit|other","amount":148.74,"due_date":"YYYY-MM-DD","period_start":"YYYY-MM-DD","period_end":"YYYY-MM-DD","address":"street and city","account_holder":"name on the bill","account_number":"account or contract number","is_autopay":false,"is_bill":true}

CRITICAL — AMOUNT:
- MUST be the FINAL TOTAL INCLUDING VAT (מע"מ)
- Look for "סה"כ לתשלום כולל מע"מ" — this is always the correct total
- If that label isn't present, look for "סה"כ לתשלום" or "סה"כ כולל מע"מ"
- Do NOT use "סה"כ צריכה" or "סה"כ ללא מע"מ" — those are subtotals
- If "לא לתשלום" or "אין לשלם" (autopay), still extract the total, set is_autopay=true
- Amount as decimal ILS number like 148.74

IS_BILL: false if not an actual invoice (notification letter, voting form, consumption alert)

BILL TYPE: iec=חברת החשמל, water=הגיחון, internet=בזק, gas=פזגז/סופרגז, vaad_bayit=ועד בית, arnona=ארנונה

ACCOUNT NUMBER: water=חשבון חוזה, iec=מספר חשבון חוזה, gas=מספר צרכן, internet=מספר קו

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
      is_bill: parsed.is_bill !== false,
    }
  } catch {
    return null
  }
}

async function callOpenRouter(
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>,
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      messages,
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    console.error('OpenRouter error:', response.status)
    return null
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || null
}

/**
 * Extract text from a PDF buffer.
 * Returns null if extraction fails (image-only PDF, encrypted, etc.)
 */
async function extractPdfText(pdfBuffer: Buffer): Promise<string | null> {
  try {
    const result = await pdfParse(pdfBuffer)
    // If text is too short, it's likely an image-only PDF
    if (result.text.trim().length < 50) return null
    return result.text
  } catch {
    return null
  }
}

/**
 * Parse a bill PDF. Pipeline:
 * 1. Extract text from PDF
 * 2. Send text to Claude (fast, cheap, accurate)
 * 3. If text extraction fails, send raw PDF to Claude (vision fallback)
 */
export async function parseBillPdf(pdfBase64: string): Promise<ParsedBill | null> {
  const pdfBuffer = Buffer.from(pdfBase64, 'base64')

  // Step 1: Try text extraction
  const extractedText = await extractPdfText(pdfBuffer)

  if (extractedText) {
    // Step 2a: Send extracted text to Claude (preferred — exact text, no vision errors)
    const response = await callOpenRouter([{
      role: 'user',
      content: `Extracted text from an Israeli utility bill:\n\n${extractedText}\n\n${EXTRACTION_PROMPT}`,
    }])

    if (response) {
      const result = parseAiResponse(response)
      if (result) return result
    }
  }

  // Step 2b: Fallback — send raw PDF to Claude vision
  const response = await callOpenRouter([{
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
  }])

  if (!response) {
    // Final fallback: Gemini
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
      const { geminiGenerate } = await import('@/lib/gemini')
      const text = await geminiGenerate('lite', geminiKey, [{
        parts: [
          { text: EXTRACTION_PROMPT },
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
        ],
      }])
      if (text) return parseAiResponse(text)
    }
    return null
  }

  return parseAiResponse(response)
}

/**
 * Parse a bill from HTML email body.
 */
export async function parseBillHtml(
  htmlBody: string,
  subject: string,
  from: string,
): Promise<ParsedBill | null> {
  const truncatedHtml = htmlBody.substring(0, 15000)

  const response = await callOpenRouter([{
    role: 'user',
    content: `Extract billing info from this Israeli utility bill email.\n\nSubject: ${subject}\nFrom: ${from}\n\nHTML body:\n${truncatedHtml}\n\n${EXTRACTION_PROMPT}`,
  }])

  if (!response) {
    // Fallback to Gemini
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
      const { geminiGenerate } = await import('@/lib/gemini')
      const text = await geminiGenerate('lite', geminiKey, [{
        parts: [{
          text: `Extract billing info from this email.\nSubject: ${subject}\nFrom: ${from}\nHTML:\n${truncatedHtml}\n\n${EXTRACTION_PROMPT}`,
        }],
      }])
      if (text) return parseAiResponse(text)
    }
    return null
  }

  return parseAiResponse(response)
}

export { extractPdfText }
export type { ParsedBill }
