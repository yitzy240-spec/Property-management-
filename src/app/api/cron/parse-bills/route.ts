import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchBillEmails, getGmailAccessToken } from '@/lib/gmail'
import { decrypt } from '@/lib/encryption'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

/**
 * GET /api/cron/parse-bills
 *
 * Fetches recent bill emails from Gmail, downloads PDF attachments,
 * sends them to AI for extraction, and creates bill records in pending_review status.
 *
 * Runs daily or on-demand. Skips already-processed Gmail message IDs.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  // Check if Gmail is connected
  const { data: tokenSetting } = await serviceClient
    .from('app_settings')
    .select('key')
    .eq('key', 'gmail_tokens')
    .single()

  if (!tokenSetting) {
    return NextResponse.json({ message: 'Gmail not connected — skipping', parsed: 0 })
  }

  try {
    const { messages } = await fetchBillEmails(10)

    if (messages.length === 0) {
      return NextResponse.json({ message: 'No new bill emails found', parsed: 0 })
    }

    let parsed = 0

    for (const msg of messages) {
      // Skip already-processed messages
      const { data: existing } = await serviceClient
        .from('bills')
        .select('id')
        .eq('gmail_message_id', msg.id)
        .limit(1)

      if (existing && existing.length > 0) continue

      // Download the first PDF attachment
      const attachment = msg.attachments[0]
      const accessToken = await getGmailAccessToken()

      const attachResponse = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${msg.id}/attachments/${attachment.attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!attachResponse.ok) continue

      const attachData = await attachResponse.json()
      const pdfBase64 = attachData.data // URL-safe base64

      // Upload PDF to Supabase Storage
      const pdfBuffer = Buffer.from(pdfBase64, 'base64url')
      const storagePath = `bills/${msg.id}_${attachment.filename}`

      await serviceClient.storage
        .from('documents')
        .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' })

      // Get AI API key for bill parsing
      const { data: aiKeySetting } = await serviceClient
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_api_key')
        .single()

      let aiParsedData = null

      if (aiKeySetting) {
        try {
          const aiApiKey = await decrypt(aiKeySetting.value)
          aiParsedData = await parseWithAI(pdfBase64, aiApiKey)
        } catch {
          // AI parsing failed — bill created with null parsed data for manual entry
        }
      }

      // Determine bill type and amount from AI parsing or defaults
      const billType = aiParsedData?.bill_type || 'other'
      const amountAgorot = aiParsedData?.amount_agorot || 0
      const dueDate = aiParsedData?.due_date || null
      const periodStart = aiParsedData?.period_start || null
      const periodEnd = aiParsedData?.period_end || null
      const propertyId = aiParsedData?.property_id || null // AI might match by address

      // Check for anomaly (>20% above 3-month average)
      let isAnomaly = false
      let anomalyNote = null

      if (propertyId && amountAgorot > 0) {
        const { data: recentBills } = await serviceClient
          .from('bills')
          .select('amount_agorot')
          .eq('property_id', propertyId)
          .eq('bill_type', billType)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(3)

        if (recentBills && recentBills.length >= 2) {
          const avg = recentBills.reduce((s, b) => s + b.amount_agorot, 0) / recentBills.length
          if (amountAgorot > avg * 1.2) {
            isAnomaly = true
            anomalyNote = `${Math.round(((amountAgorot / avg) - 1) * 100)}% above 3-month average`
          }
        }
      }

      // Create bill in pending_review (or flagged if anomaly)
      const { error: billError } = await serviceClient
        .from('bills')
        .insert({
          property_id: propertyId,
          bill_type: billType,
          amount_agorot: amountAgorot,
          due_date: dueDate,
          billing_period_start: periodStart,
          billing_period_end: periodEnd,
          status: isAnomaly ? 'flagged' : 'pending_review',
          is_anomaly: isAnomaly,
          anomaly_note: anomalyNote,
          pdf_storage_path: storagePath,
          gmail_message_id: msg.id,
          ai_parsed_data: aiParsedData,
        })

      if (!billError) parsed++
    }

    return NextResponse.json({ message: `Parsed ${parsed} bills`, parsed })
  } catch (err) {
    console.error('Bill parsing error:', err)
    return NextResponse.json(
      { error: 'Bill parsing failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}

/**
 * Use AI (Gemini Flash or Claude Haiku) to extract bill data from a PDF.
 * Returns structured data or null on failure.
 */
async function parseWithAI(
  pdfBase64: string,
  apiKey: string
): Promise<{
  bill_type: string
  amount_agorot: number
  due_date: string | null
  period_start: string | null
  period_end: string | null
  property_id: string | null
} | null> {
  // Using Gemini Flash API (cheaper for this volume)
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Extract the following from this Israeli utility bill PDF:
- bill_type: one of "arnona", "iec", "water", "vaad_bayit", "internet", "gas", "other"
- amount: the total amount due in ILS (as a number, e.g. 842.50)
- due_date: payment due date in YYYY-MM-DD format
- period_start: billing period start in YYYY-MM-DD
- period_end: billing period end in YYYY-MM-DD
- address: the property address on the bill

Return ONLY valid JSON with these fields. If you can't determine a field, use null.`,
              },
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: pdfBase64,
                },
              },
            ],
          },
        ],
      }),
    }
  )

  if (!response.ok) return null

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) return null

  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    return {
      bill_type: parsed.bill_type || 'other',
      amount_agorot: parsed.amount ? Math.round(parsed.amount * 100) : 0,
      due_date: parsed.due_date || null,
      period_start: parsed.period_start || null,
      period_end: parsed.period_end || null,
      property_id: null, // TODO: match address against properties table
    }
  } catch {
    return null
  }
}
