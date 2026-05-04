import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getGmailAccessToken } from '@/lib/gmail'
import { geminiGenerate } from '@/lib/gemini'
import { verifyBillRouting, resolveBillRoutingWithoutLabel, withHebrewAliases } from '@/lib/bill-routing'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

/**
 * POST /api/webhooks/gmail-bills
 *
 * Dedicated bills-only Gmail inbox handler.
 * Every email in this inbox is a bill — no classification needed.
 *
 * Activate by setting GMAIL_BILLS_MODE=dedicated in env vars
 * and pointing Pub/Sub to this endpoint instead of /api/webhooks/gmail.
 *
 * Flow:
 * 1. Pub/Sub notification → get new message IDs
 * 2. For each message: extract PDF/HTML → AI parse → route via verifyBillRouting → create bill
 * 3. bill_sender_mappings only auto-learned when routing_confidence='verified'
 */
export async function POST(request: Request) {
  try {
    // Verify webhook authenticity
    const webhookSecret = process.env.GMAIL_WEBHOOK_SECRET
    if (webhookSecret) {
      const authHeader = request.headers.get('authorization')
      if (authHeader !== `Bearer ${webhookSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()

    const pubsubMessage = body.message
    if (!pubsubMessage?.data) {
      return NextResponse.json({ ok: true })
    }

    const decoded = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString())
    const newHistoryId = decoded.historyId

    if (!newHistoryId) {
      return NextResponse.json({ ok: true })
    }

    const serviceClient = createServiceClient()

    // Get last processed historyId
    const { data: lastHistory } = await serviceClient
      .from('app_settings')
      .select('value')
      .eq('key', 'gmail_bills_history_id')
      .single()

    const lastHistoryId = lastHistory?.value

    // Store new historyId
    await serviceClient.from('app_settings').upsert({
      key: 'gmail_bills_history_id',
      value: String(newHistoryId),
      description: 'Last processed Gmail bills inbox history ID',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

    if (!lastHistoryId) {
      return NextResponse.json({ ok: true, message: 'Initial historyId stored' })
    }

    // Fetch new messages
    const accessToken = await getGmailAccessToken()
    const historyRes = await fetch(
      `${GMAIL_API_BASE}/users/me/history?startHistoryId=${lastHistoryId}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!historyRes.ok) {
      return NextResponse.json({ ok: true, message: 'History expired, reset' })
    }

    const historyData = await historyRes.json()
    const newMessageIds = new Set<string>()

    for (const history of historyData.history || []) {
      for (const added of history.messagesAdded || []) {
        newMessageIds.add(added.message.id)
      }
    }

    if (newMessageIds.size === 0) {
      return NextResponse.json({ ok: true, message: 'No new messages' })
    }

    // Preload matching data
    const [
      { data: rawProperties },
      { data: owners },
      { data: senderMappings },
      { data: utilityAccounts },
    ] = await Promise.all([
      serviceClient.from('properties').select('id, name, address, owner_id').eq('is_active', true),
      serviceClient.from('owners').select('id, full_name'),
      serviceClient.from('bill_sender_mappings').select('*'),
      serviceClient.from('property_utility_accounts').select('id, property_id, utility_type, account_number'),
    ])

    // Stamp Hebrew aliases so PDFs in Hebrew route correctly against
    // properties whose addresses are stored as English transliteration.
    const properties = rawProperties ? withHebrewAliases(rawProperties) : []

    let bills = 0
    let flaggedMismatches = 0
    const apiKey = process.env.GEMINI_API_KEY

    for (const messageId of newMessageIds) {
      // Skip if already processed
      const { data: existing } = await serviceClient
        .from('bills')
        .select('id')
        .eq('gmail_message_id', messageId)
        .limit(1)

      if (existing && existing.length > 0) continue

      // Fetch full message — no classification needed, it's a bill
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

      // Extract PDF attachment
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

      // AI extraction — single stage, no classification needed
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
      const dueDate = (aiParsedData?.due_date as string) || null
      const periodStart = (aiParsedData?.period_start as string) || null
      const periodEnd = (aiParsedData?.period_end as string) || null

      // ── Property routing ──
      // Pre-stage: candidate from sender mapping or owner name match.
      // Then verifyBillRouting cross-checks the PDF payload.
      let labelPropertyId: string | null = null
      let preMatchSignal: 'learned_mapping' | 'owner_name' | null = null

      const learnedMapping = (senderMappings ?? []).find(
        m => m.sender_email === senderEmail && m.bill_type === billType
      )
      if (learnedMapping) {
        labelPropertyId = learnedMapping.property_id
        preMatchSignal = 'learned_mapping'
      }

      if (!labelPropertyId) {
        const searchText = `${subject} ${aiParsedData?.account_holder || ''}`.toLowerCase()
        for (const owner of owners ?? []) {
          const nameParts = owner.full_name.toLowerCase().split(' ')
          const allMatch = nameParts.length >= 2 && nameParts.every(
            (p: string) => p.length > 2 && searchText.includes(p)
          )
          if (allMatch) {
            const prop = (properties ?? []).find(p => p.owner_id === owner.id)
            if (prop) {
              labelPropertyId = prop.id
              preMatchSignal = 'owner_name'
              break
            }
          }
        }
      }

      let routingResult: ReturnType<typeof verifyBillRouting>
      if (labelPropertyId) {
        routingResult = verifyBillRouting({
          labelPropertyId,
          parsedPdf: {
            account_number: (aiParsedData?.account_number as string) ?? undefined,
            account_holder: (aiParsedData?.account_holder as string) ?? undefined,
            address: (aiParsedData?.address as string) ?? undefined,
            bill_type: billType,
          },
          utilityAccounts: utilityAccounts ?? [],
          properties: properties ?? [],
        })
      } else {
        routingResult = resolveBillRoutingWithoutLabel({
          parsedPdf: {
            account_number: (aiParsedData?.account_number as string) ?? undefined,
            address: (aiParsedData?.address as string) ?? undefined,
            bill_type: billType,
          },
          utilityAccounts: utilityAccounts ?? [],
          properties: properties ?? [],
        })
      }

      const propertyId = routingResult.propertyId
      if (routingResult.confidence === 'mismatch') flaggedMismatches++

      // Auto-learn bill_sender_mappings only when routing is verified.
      // Do NOT learn from a bare owner-name match without PDF cross-check —
      // that's how we got the original misrouting bug.
      const shouldLearnMapping =
        routingResult.confidence === 'verified' &&
        preMatchSignal === 'owner_name' &&
        propertyId !== null

      if (shouldLearnMapping) {
        const ownerForProp = (owners ?? []).find(
          o => (properties ?? []).some(p => p.id === propertyId && p.owner_id === o.id)
        )
        if (ownerForProp) {
          await serviceClient.from('bill_sender_mappings').upsert({
            sender_email: senderEmail,
            sender_name_pattern: from,
            subject_pattern: ownerForProp.full_name,
            property_id: propertyId,
            bill_type: billType,
            confirmed: false,
          }, { onConflict: 'sender_email,property_id,bill_type' }).select()
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

      let billStatus: 'pending_review' | 'flagged' = 'pending_review'
      if (routingResult.confidence === 'mismatch') {
        billStatus = 'flagged'
        if (!anomalyNote) anomalyNote = routingResult.reason ?? 'Routing mismatch — manual review required.'
        isAnomaly = true
      } else if (isAnomaly) {
        billStatus = 'flagged'
      }

      // Create bill
      const { error: billError } = await serviceClient.from('bills').insert({
        property_id: propertyId,
        bill_type: billType,
        amount_agorot: amountAgorot,
        due_date: dueDate,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        status: billStatus,
        is_anomaly: isAnomaly,
        anomaly_note: anomalyNote,
        pdf_storage_path: storagePath,
        gmail_message_id: messageId,
        routing_confidence: routingResult.confidence,
        ai_parsed_data: {
          ...aiParsedData,
          match_method: routingResult.signal,
          pre_match_signal: preMatchSignal,
          routing_reason: routingResult.reason,
          source: 'dedicated_inbox',
        },
      })

      if (!billError) bills++
    }

    console.log(
      `[gmail-bills-webhook] new_messages=${newMessageIds.size} bills_created=${bills} flagged_mismatches=${flaggedMismatches}`,
    )

    return NextResponse.json({ ok: true, bills, flagged_mismatches: flaggedMismatches })
  } catch (err) {
    console.error('[Gmail Bills Webhook]', err)
    return NextResponse.json({ ok: true }) // Always ack
  }
}

/** Extract bill data from PDF or HTML using Gemini */
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
