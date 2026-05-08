import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getGmailAccessToken } from '@/lib/gmail'
import { verifyBillRouting, resolveBillRoutingWithoutLabel, withHebrewAliases } from '@/lib/bill-routing'
import { parseBillPdf, parseBillHtml } from '@/lib/bill-parser'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

/**
 * POST /api/webhooks/gmail
 * Receives Google Pub/Sub push notifications when new emails arrive.
 * Processes one email at a time — no timeout issues.
 *
 * Flow:
 * 1. Decode Pub/Sub notification → get historyId
 * 2. Fetch new messages since last historyId
 * 3. For each new message: AI classify "is this a bill?" → if yes, extract
 */
export async function POST(request: Request) {
  try {
    // Verify webhook authenticity via shared secret
    const webhookSecret = process.env.GMAIL_WEBHOOK_SECRET
    if (webhookSecret) {
      const authHeader = request.headers.get('authorization')
      if (authHeader !== `Bearer ${webhookSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()

    // Pub/Sub sends: { message: { data: base64, messageId, publishTime }, subscription }
    const pubsubMessage = body.message
    if (!pubsubMessage?.data) {
      return NextResponse.json({ ok: true }) // Ack empty messages
    }

    // Decode the notification
    const decoded = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString())
    const emailAddress = decoded.emailAddress
    const newHistoryId = decoded.historyId

    if (!newHistoryId) {
      return NextResponse.json({ ok: true })
    }

    const serviceClient = createServiceClient()

    // Get the last processed historyId
    const { data: lastHistory } = await serviceClient
      .from('app_settings')
      .select('value')
      .eq('key', 'gmail_history_id')
      .single()

    const lastHistoryId = lastHistory?.value

    // Store the new historyId
    await serviceClient
      .from('app_settings')
      .upsert({
        key: 'gmail_history_id',
        value: String(newHistoryId),
        description: 'Last processed Gmail history ID',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    // If no previous historyId, just store this one and wait for next notification
    if (!lastHistoryId) {
      return NextResponse.json({ ok: true, message: 'Initial historyId stored' })
    }

    // Fetch new messages since last historyId
    const accessToken = await getGmailAccessToken()
    const historyRes = await fetch(
      `${GMAIL_API_BASE}/users/me/history?startHistoryId=${lastHistoryId}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!historyRes.ok) {
      // historyId might be too old (404) — just update and move on
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

    // Process each new message (usually 1-3 at a time)
    let classified = 0
    let bills = 0

    for (const messageId of newMessageIds) {
      // Skip if already processed
      const { data: existing } = await serviceClient
        .from('bills')
        .select('id')
        .eq('gmail_message_id', messageId)
        .limit(1)

      if (existing && existing.length > 0) continue

      // Fetch message metadata first (cheap)
      const metaRes = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!metaRes.ok) continue
      const metaData = await metaRes.json()
      const headers = metaData.payload?.headers || []
      const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value || ''
      const from = headers.find((h: { name: string }) => h.name === 'From')?.value || ''

      // Stage 1: Quick AI classification — is this a bill?
      const isBill = await classifyAsBill(subject, from)
      classified++

      if (!isBill) continue

      // Stage 2: Full fetch + extraction
      const fullRes = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!fullRes.ok) continue
      const fullData = await fullRes.json()
      const date = headers.find((h: { name: string }) => h.name === 'Date')?.value || ''

      // Extract PDF if available
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

      // Download PDF if available
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
        } catch {
          // PDF download failed
        }
      }

      // AI extraction — use the shared parser so we get the same
      // schema as the cron path, including account_number which the
      // routing helper uses as its strongest signal.
      let aiParsedData: Awaited<ReturnType<typeof parseBillPdf>> = null
      try {
        if (pdfBase64) {
          aiParsedData = await parseBillPdf(pdfBase64)
        } else if (htmlBody) {
          aiParsedData = await parseBillHtml(htmlBody, subject, from)
        }
      } catch {
        // Extraction failed — bill still gets inserted for manual entry below
      }

      // Property routing — same shared helpers as the cron, so
      // account_number takes precedence over address (key for
      // disambiguating Hagihon's "Agripas 6/8" labeling, IEC's
      // mirrored "Agripas 8" labeling, etc).
      const { data: owners } = await serviceClient.from('owners').select('id, full_name')
      const { data: rawProperties } = await serviceClient.from('properties').select('id, owner_id, address, name').eq('is_active', true)
      const { data: utilityAccounts } = await serviceClient
        .from('property_utility_accounts')
        .select('id, property_id, utility_type, account_number')
      const properties = rawProperties ? withHebrewAliases(rawProperties) : []

      // First try owner-name match (English & Hebrew tokens) on
      // subject + AI-parsed account_holder. If that finds a candidate,
      // pass it through verifyBillRouting so the PDF cross-checks it.
      let labelPropertyId: string | null = null
      const searchText = `${subject} ${aiParsedData?.account_holder || ''}`.toLowerCase()
      for (const owner of owners ?? []) {
        const tokens = owner.full_name.toLowerCase().split(/\s+/).filter((t: string) => t.length >= 3)
        if (tokens.length >= 2 && tokens.every((t: string) => searchText.includes(t))) {
          const prop = properties.find(p => p.owner_id === owner.id)
          if (prop) { labelPropertyId = prop.id; break }
        }
      }

      const routing = labelPropertyId
        ? verifyBillRouting({
            labelPropertyId,
            parsedPdf: {
              account_number: aiParsedData?.account_number ?? undefined,
              account_holder: aiParsedData?.account_holder ?? undefined,
              address: aiParsedData?.address ?? undefined,
              bill_type: aiParsedData?.bill_type,
            },
            utilityAccounts: utilityAccounts ?? [],
            properties,
          })
        : resolveBillRoutingWithoutLabel({
            parsedPdf: {
              account_number: aiParsedData?.account_number ?? undefined,
              address: aiParsedData?.address ?? undefined,
              bill_type: aiParsedData?.bill_type,
            },
            utilityAccounts: utilityAccounts ?? [],
            properties,
          })

      // bills.property_id is NOT NULL — when routing returns mismatch,
      // fall back to the pre-match candidate so the bill isn't lost.
      const propertyId =
        routing.propertyId ??
        (routing.confidence === 'mismatch' ? labelPropertyId : null)

      // Create bill — UNIQUE index on gmail_message_id makes the
      // insert idempotent, so concurrent webhook invocations from
      // Pub/Sub at-least-once delivery can't produce duplicates.
      const { error: billError } = await serviceClient.from('bills').insert({
        property_id: propertyId,
        bill_type: aiParsedData?.bill_type || 'other',
        amount_agorot: aiParsedData?.amount_agorot || 0,
        due_date: aiParsedData?.due_date || null,
        billing_period_start: aiParsedData?.period_start || null,
        billing_period_end: aiParsedData?.period_end || null,
        status: 'pending_review',
        is_anomaly: routing.confidence === 'mismatch',
        anomaly_note: routing.confidence === 'mismatch' ? routing.reason ?? null : null,
        pdf_storage_path: storagePath,
        gmail_message_id: messageId,
        routing_confidence: routing.confidence,
        ai_parsed_data: {
          ...aiParsedData,
          match_method: routing.signal,
          routing_reason: routing.reason,
          source: 'webhook',
        },
      })

      // 23505 = unique_violation: another webhook invocation beat us
      // to it. Treat as success — the row exists.
      if (billError && billError.code !== '23505') {
        console.error('[Gmail Webhook] insert failed', billError.message)
      }
      bills++
    }

    return NextResponse.json({ ok: true, classified, bills })
  } catch (err) {
    console.error('[Gmail Webhook]', err)
    return NextResponse.json({ ok: true }) // Always ack to prevent retries
  }
}

/** Stage 1: Cheap AI classification — is this email a bill? */
async function classifyAsBill(subject: string, from: string): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return false

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Is this email a utility bill, property tax, building maintenance fee, water bill, electricity bill, internet bill, cleaning service payment, or similar property expense?

From: ${from}
Subject: ${subject}

Reply ONLY "yes" or "no".` }] }],
        }),
      }
    )

    if (!res.ok) return false
    const data = await res.json()
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.toLowerCase().trim()
    return answer === 'yes'
  } catch {
    return false
  }
}

// extractBillData was removed in favor of parseBillPdf / parseBillHtml
// from lib/bill-parser.ts so the webhook gets the same schema as the
// cron path — including account_number which the routing helper uses
// as its strongest signal.
