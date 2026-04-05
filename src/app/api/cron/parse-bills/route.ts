import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchBillEmails, getGmailAccessToken } from '@/lib/gmail'
import { geminiGenerate } from '@/lib/gemini'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

/**
 * GET /api/cron/parse-bills
 *
 * 1. Fetch bill emails from Gmail (filtered by utility keywords + PDF attachment)
 * 2. Download PDF, upload to storage
 * 3. AI-extract bill data (type, amount, due date, address, account holder name)
 * 4. Match to property: learned mappings first, then owner name fuzzy match
 * 5. Create bill in verification queue (pending_review or flagged if anomaly)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const { data: tokenSetting } = await serviceClient
    .from('app_settings')
    .select('key')
    .eq('key', 'gmail_tokens')
    .single()

  if (!tokenSetting) {
    return NextResponse.json({ message: 'Gmail not connected — skipping', parsed: 0 })
  }

  // Preload data for matching
  const [
    { data: properties },
    { data: owners },
    { data: senderMappings },
    { data: utilityAccounts },
  ] = await Promise.all([
    serviceClient.from('properties').select('id, name, address, owner_id').eq('is_active', true),
    serviceClient.from('owners').select('id, full_name'),
    serviceClient.from('bill_sender_mappings').select('*').eq('confirmed', true),
    serviceClient.from('property_utility_accounts').select('property_id, utility_type, account_number'),
  ])

  try {
    const { messages } = await fetchBillEmails(10)

    if (messages.length === 0) {
      return NextResponse.json({ message: 'No new bill emails found', parsed: 0 })
    }

    let parsed = 0

    for (const msg of messages) {
      const { data: existing } = await serviceClient
        .from('bills')
        .select('id')
        .eq('gmail_message_id', msg.id)
        .limit(1)

      if (existing && existing.length > 0) continue

      const attachment = msg.attachments[0]
      const accessToken = await getGmailAccessToken()

      const attachResponse = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${msg.id}/attachments/${attachment.attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!attachResponse.ok) continue

      const attachData = await attachResponse.json()
      const pdfBase64 = attachData.data

      const pdfBuffer = Buffer.from(pdfBase64, 'base64url')
      const storagePath = `bills/${msg.id}_${attachment.filename}`

      await serviceClient.storage
        .from('documents')
        .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' })

      // AI extraction
      let aiParsedData = null
      if (process.env.GEMINI_API_KEY) {
        try {
          aiParsedData = await parseWithAI(pdfBase64, process.env.GEMINI_API_KEY)
        } catch {
          // AI parsing failed — continue with null data
        }
      }

      const billType = aiParsedData?.bill_type || 'other'
      const amountAgorot = aiParsedData?.amount_agorot || 0
      const dueDate = aiParsedData?.due_date || null
      const periodStart = aiParsedData?.period_start || null
      const periodEnd = aiParsedData?.period_end || null

      // ── Property matching ──
      let propertyId: string | null = null
      let matchMethod: string | null = null

      // 1. Check learned sender mappings (highest confidence)
      const senderEmail = msg.from.replace(/.*<(.+)>.*/, '$1').toLowerCase()
      const learnedMapping = (senderMappings ?? []).find(
        m => m.sender_email === senderEmail && m.bill_type === billType
      )

      if (learnedMapping) {
        propertyId = learnedMapping.property_id
        matchMethod = 'learned_mapping'
      }

      // 2. Match by utility account number (highest confidence after sender mapping)
      if (!propertyId && aiParsedData?.account_number) {
        const accountMatch = (utilityAccounts ?? []).find(
          ua => ua.utility_type === billType && ua.account_number === aiParsedData.account_number
        )
        if (accountMatch) {
          propertyId = accountMatch.property_id
          matchMethod = 'account_number'
        }
      }

      // 3. Match by owner name in subject or AI-extracted account holder
      if (!propertyId) {
        const searchText = `${msg.subject} ${aiParsedData?.account_holder || ''}`.toLowerCase()

        for (const owner of (owners ?? [])) {
          const nameParts = owner.full_name.toLowerCase().split(' ')
          // Match if ALL parts of the owner name appear in subject/bill
          const allPartsMatch = nameParts.length >= 2 && nameParts.every(
            (part: string) => part.length > 2 && searchText.includes(part)
          )

          if (allPartsMatch) {
            // Find property belonging to this owner
            const ownerProperty = (properties ?? []).find(p => p.owner_id === owner.id)
            if (ownerProperty) {
              propertyId = ownerProperty.id
              matchMethod = 'owner_name'

              // Auto-create a mapping for future use (unconfirmed)
              await serviceClient.from('bill_sender_mappings').upsert({
                sender_email: senderEmail,
                sender_name_pattern: msg.from,
                subject_pattern: owner.full_name,
                property_id: propertyId,
                bill_type: billType,
                confirmed: false,
              }, { onConflict: 'sender_email,property_id,bill_type' }).select()

              break
            }
          }
        }
      }

      // 3. Match by address from AI extraction
      if (!propertyId && aiParsedData?.address) {
        const billAddress = aiParsedData.address.toLowerCase()
        const matched = (properties ?? []).find(p =>
          billAddress.includes(p.address.toLowerCase()) ||
          p.address.toLowerCase().includes(billAddress)
        )
        if (matched) {
          propertyId = matched.id
          matchMethod = 'address'
        }
      }

      // Anomaly detection
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
          ai_parsed_data: { ...aiParsedData, match_method: matchMethod },
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
 * AI extraction using Gemini 3.1 Flash-Lite (structured PDF extraction)
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
  address: string | null
  account_holder: string | null
  account_number: string | null
} | null> {
  const text = await geminiGenerate('lite', apiKey, [
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
- account_holder: the name of the person/entity the bill is addressed to (שם בעל החשבון)
- account_number: the utility account/contract/meter number (מספר חשבון/מספר חוזה/מספר מונה)

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
  ])

  if (!text) return null

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
