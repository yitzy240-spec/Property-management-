import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getGmailAccessToken } from '@/lib/gmail'
import { geminiGenerate } from '@/lib/gemini'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

/**
 * GET /api/cron/parse-bills-dedicated
 *
 * Batch processor for dedicated bills-only Gmail inbox.
 * Fetches recent emails, skips already-processed ones, AI-extracts bill data.
 *
 * Activate by changing the cron job to point here instead of /api/cron/parse-bills
 * once the dedicated Gmail is set up.
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

  // Renew Pub/Sub watch
  try {
    const { watchGmail } = await import('@/lib/gmail')
    if (process.env.GMAIL_PUBSUB_TOPIC) {
      await watchGmail()
    }
  } catch {}

  // Preload matching data
  const [
    { data: properties },
    { data: owners },
    { data: senderMappings },
    { data: utilityAccounts },
  ] = await Promise.all([
    serviceClient.from('properties').select('id, name, address, owner_id').eq('is_active', true),
    serviceClient.from('owners').select('id, full_name'),
    serviceClient.from('bill_sender_mappings').select('*'),
    serviceClient.from('property_utility_accounts').select('property_id, utility_type, account_number'),
  ])

  try {
    const accessToken = await getGmailAccessToken()

    // Fetch all emails from the last 30 days (dedicated inbox = all bills)
    const listRes = await fetch(
      `${GMAIL_API_BASE}/users/me/messages?maxResults=50&q=after:${thirtyDaysAgo()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!listRes.ok) {
      return NextResponse.json({ error: 'Failed to list messages', parsed: 0 }, { status: 500 })
    }

    const listData = await listRes.json()
    const messages = listData.messages || []

    if (messages.length === 0) {
      return NextResponse.json({ message: 'No emails in inbox', parsed: 0 })
    }

    let parsed = 0
    const apiKey = process.env.GEMINI_API_KEY

    for (const { id: messageId } of messages) {
      // Skip already processed
      const { data: existing } = await serviceClient
        .from('bills')
        .select('id')
        .eq('gmail_message_id', messageId)
        .limit(1)

      if (existing && existing.length > 0) continue

      // Fetch full message
      const fullRes = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!fullRes.ok) continue
      const fullData = await fullRes.json()

      const headers = fullData.payload?.headers || []
      const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value || ''
      const from = headers.find((h: { name: string }) => h.name === 'From')?.value || ''
      const senderEmail = from.replace(/.*<(.+)>.*/, '$1').toLowerCase()

      // Extract PDF
      let pdfFilename: string | null = null
      let attachmentId: string | null = null
      function findPdf(parts: { filename?: string; mimeType?: string; body?: { attachmentId?: string }; parts?: unknown[] }[]) {
        for (const part of parts) {
          if (part.filename && (part.mimeType === 'application/pdf' || part.filename.toLowerCase().endsWith('.pdf')) && part.body?.attachmentId) {
            pdfFilename = part.filename
            attachmentId = part.body.attachmentId
            return
          }
          if (part.parts) findPdf(part.parts as typeof parts)
        }
      }
      if (fullData.payload?.parts) findPdf(fullData.payload.parts)

      // Extract HTML body
      let htmlBody: string | null = null
      function findHtml(parts: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[]) {
        for (const part of parts) {
          if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64url').toString('utf-8')
            return
          }
          if (part.parts) findHtml(part.parts as typeof parts)
        }
      }
      if (fullData.payload?.parts) findHtml(fullData.payload.parts)
      else if (fullData.payload?.body?.data && fullData.payload?.mimeType === 'text/html') {
        htmlBody = Buffer.from(fullData.payload.body.data, 'base64url').toString('utf-8')
      }

      if (!pdfFilename && !htmlBody) continue

      // Download PDF
      let pdfBase64: string | null = null
      let storagePath: string | null = null

      if (attachmentId && pdfFilename) {
        try {
          const attachRes = await fetch(
            `${GMAIL_API_BASE}/users/me/messages/${messageId}/attachments/${attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (attachRes.ok) {
            const attachData = await attachRes.json()
            pdfBase64 = attachData.data
            const pdfBuffer = Buffer.from(pdfBase64 as string, 'base64url')
            // Use messageId-only key — pdfFilename can be Hebrew (utility companies),
            // and Supabase Storage rejects non-ASCII keys.
            storagePath = `bills/${messageId}.pdf`
            await serviceClient.storage
              .from('documents')
              .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' })
          }
        } catch {}
      }

      // AI extraction — no classification, straight to parsing
      let aiParsedData: Record<string, unknown> | null = null
      if (apiKey) {
        try {
          if (pdfBase64) {
            aiParsedData = await extractBillData(pdfBase64, 'pdf', subject, from, apiKey)
          } else if (htmlBody) {
            aiParsedData = await extractBillData(htmlBody, 'html', subject, from, apiKey)
          }
        } catch {}
      }

      const billType = (aiParsedData?.bill_type as string) || 'other'
      const amountAgorot = (aiParsedData?.amount_agorot as number) || 0

      // Property matching
      let propertyId: string | null = null
      let matchMethod: string | null = null

      // 1. Sender mapping
      const mapping = (senderMappings ?? []).find(
        m => m.sender_email === senderEmail && m.bill_type === billType
      )
      if (mapping) {
        propertyId = mapping.property_id
        matchMethod = 'learned_mapping'
      }

      // 2. Account number
      if (!propertyId && aiParsedData?.account_number) {
        const acctMatch = (utilityAccounts ?? []).find(
          ua => ua.utility_type === billType && ua.account_number === aiParsedData!.account_number
        )
        if (acctMatch) {
          propertyId = acctMatch.property_id
          matchMethod = 'account_number'
        }
      }

      // 3. Owner name
      if (!propertyId) {
        const searchText = `${subject} ${aiParsedData?.account_holder || ''}`.toLowerCase()
        for (const owner of owners ?? []) {
          const nameParts = owner.full_name.toLowerCase().split(' ')
          const allMatch = nameParts.length >= 2 && nameParts.every(
            (p: string) => p.length > 2 && searchText.includes(p)
          )
          if (allMatch) {
            const prop = (properties ?? []).find(p => p.owner_id === owner.id)
            if (prop) {
              propertyId = prop.id
              matchMethod = 'owner_name'
              await serviceClient.from('bill_sender_mappings').upsert({
                sender_email: senderEmail,
                sender_name_pattern: from,
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

      // 4. Address
      if (!propertyId && aiParsedData?.address) {
        const addr = (aiParsedData.address as string).toLowerCase()
        const match = (properties ?? []).find(p =>
          addr.includes(p.address.toLowerCase()) || p.address.toLowerCase().includes(addr)
        )
        if (match) {
          propertyId = match.id
          matchMethod = 'address'
        }
      }

      // Anomaly detection
      let isAnomaly = false
      let anomalyNote: string | null = null
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

      await serviceClient.from('bills').insert({
        property_id: propertyId,
        bill_type: billType,
        amount_agorot: amountAgorot,
        due_date: (aiParsedData?.due_date as string) || null,
        billing_period_start: (aiParsedData?.period_start as string) || null,
        billing_period_end: (aiParsedData?.period_end as string) || null,
        status: isAnomaly ? 'flagged' : 'pending_review',
        is_anomaly: isAnomaly,
        anomaly_note: anomalyNote,
        pdf_storage_path: storagePath,
        gmail_message_id: messageId,
        ai_parsed_data: { ...aiParsedData, match_method: matchMethod, source: 'dedicated_inbox' },
      })

      parsed++
    }

    return NextResponse.json({ message: `Parsed ${parsed} bills from dedicated inbox`, parsed })
  } catch (err) {
    console.error('[Dedicated Bills Parser]', err)
    return NextResponse.json(
      { error: 'Bill parsing failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}

function thirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

async function extractBillData(
  content: string,
  type: 'pdf' | 'html',
  subject: string,
  from: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  const prompt = `Extract billing information from this Israeli utility bill.
Email subject: ${subject}
Email from: ${from}

${type === 'html' ? `Email HTML body:\n${content.substring(0, 10000)}` : ''}

Extract:
- bill_type: one of "arnona", "iec", "water", "vaad_bayit", "internet", "gas", "cleaning", "other"
- amount: total amount due in ILS (number, e.g. 842.50)
- due_date: payment due date in YYYY-MM-DD format
- period_start: billing period start in YYYY-MM-DD
- period_end: billing period end in YYYY-MM-DD
- address: property address on the bill
- account_holder: name of person/entity (שם בעל החשבון)
- account_number: account/contract number

Return ONLY valid JSON. Use null for unknown fields.`

  const parts: Record<string, unknown>[] = type === 'pdf'
    ? [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: content } }]
    : [{ text: prompt }]

  const text = await geminiGenerate('lite', apiKey, [{ parts }])
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
