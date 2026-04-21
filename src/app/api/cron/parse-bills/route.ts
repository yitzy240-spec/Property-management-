import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getGmailAccessToken } from '@/lib/gmail'
import { parseBillPdf, parseBillHtml } from '@/lib/bill-parser'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

/**
 * GET /api/cron/parse-bills
 *
 * Label-based bill routing:
 * 1. Load Gmail label → property mapping from app_settings
 * 2. For each Bill/* label, fetch new emails
 * 3. Download PDF, upload to storage
 * 4. AI-extract bill data (Claude Sonnet via OpenRouter, Gemini fallback)
 * 5. Property is known from the label — no fuzzy matching needed
 * 6. Account number matching for Hagihon (identical emails, different accounts)
 * 7. Create bill in verification queue
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

  // Load label → property mapping
  const { data: mappingSetting } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'gmail_bill_label_mapping')
    .single()

  if (!mappingSetting) {
    return NextResponse.json({ error: 'No Gmail label mapping configured', parsed: 0 }, { status: 500 })
  }

  const labelToProperty: Record<string, string> = JSON.parse(mappingSetting.value)

  // Load utility accounts for account-number-based routing (Hagihon)
  const { data: utilityAccounts } = await serviceClient
    .from('property_utility_accounts')
    .select('property_id, utility_type, account_number')

  // Renew Gmail Pub/Sub watch
  try {
    const { watchGmail } = await import('@/lib/gmail')
    if (process.env.GMAIL_PUBSUB_TOPIC) {
      await watchGmail()
    }
  } catch {
    // Not critical
  }

  const accessToken = await getGmailAccessToken()

  // List Gmail labels
  const labelsRes = await fetch(`${GMAIL_API_BASE}/users/me/labels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!labelsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch Gmail labels' }, { status: 500 })
  }
  const labelsData = await labelsRes.json()
  const allLabels: { id: string; name: string }[] = labelsData.labels || []

  // Filter to Bill/* labels that have a property mapping
  const billLabels = allLabels.filter(l => labelToProperty[l.name])

  let parsed = 0
  let skipped = 0

  for (const label of billLabels) {
    const propertyId = labelToProperty[label.name]

    // Fetch recent emails in this label
    const msgListRes = await fetch(
      `${GMAIL_API_BASE}/users/me/messages?labelIds=${label.id}&maxResults=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!msgListRes.ok) continue
    const msgListData = await msgListRes.json()
    if (!msgListData.messages) continue

    for (const msgRef of msgListData.messages) {
      // Skip already-processed emails
      const { data: existing } = await serviceClient
        .from('bills')
        .select('id')
        .eq('gmail_message_id', msgRef.id)
        .limit(1)

      if (existing && existing.length > 0) {
        skipped++
        continue
      }

      // Fetch full message
      const msgRes = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${msgRef.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!msgRes.ok) continue
      const msg = await msgRes.json()

      const headers = msg.payload?.headers || []
      const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value || ''
      const from = headers.find((h: { name: string }) => h.name === 'From')?.value || ''

      // Find PDF attachment
      let pdfFilename: string | null = null
      let attachmentId: string | null = null
      const findPdf = (parts: { filename?: string; mimeType?: string; body?: { attachmentId?: string }; parts?: unknown[] }[]) => {
        for (const part of parts) {
          if (part.filename && (part.mimeType === 'application/pdf' || part.filename.toLowerCase().endsWith('.pdf')) && part.body?.attachmentId) {
            pdfFilename = part.filename
            attachmentId = part.body.attachmentId
            return
          }
          if (part.parts) findPdf(part.parts as typeof parts)
        }
      }
      if (msg.payload?.parts) findPdf(msg.payload.parts)

      // Find HTML body
      let htmlBody: string | null = null
      const findHtml = (parts: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[]) => {
        for (const part of parts) {
          if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64url').toString('utf-8')
            return
          }
          if (part.parts) findHtml(part.parts as typeof parts)
        }
      }
      if (msg.payload?.parts) findHtml(msg.payload.parts)
      else if (msg.payload?.body?.data && msg.payload?.mimeType === 'text/html') {
        htmlBody = Buffer.from(msg.payload.body.data, 'base64url').toString('utf-8')
      }

      // Skip emails with no bill content
      if (!attachmentId && !htmlBody) continue

      let pdfBase64: string | null = null
      let storagePath: string | null = null

      // Download PDF if available
      if (attachmentId && pdfFilename) {
        try {
          const attachResponse = await fetch(
            `${GMAIL_API_BASE}/users/me/messages/${msgRef.id}/attachments/${attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
          if (attachResponse.ok) {
            const attachData = await attachResponse.json()
            pdfBase64 = attachData.data.replace(/-/g, '+').replace(/_/g, '/')
            const pdfBuffer = Buffer.from(attachData.data, 'base64url')
            storagePath = `bills/${msgRef.id}_${pdfFilename}`
            await serviceClient.storage
              .from('documents')
              .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' })
          }
        } catch {
          // PDF download failed — will use HTML body instead
        }
      }

      // AI extraction
      let aiParsedData = null
      try {
        if (pdfBase64) {
          aiParsedData = await parseBillPdf(pdfBase64)
        } else if (htmlBody) {
          aiParsedData = await parseBillHtml(htmlBody, subject, from)
        }
      } catch {
        // AI parsing failed — bill created with null data for manual entry
      }

      const billType = aiParsedData?.bill_type || 'other'
      const amountAgorot = aiParsedData?.amount_agorot || 0
      const dueDate = aiParsedData?.due_date || null
      const periodStart = aiParsedData?.period_start || null
      const periodEnd = aiParsedData?.period_end || null

      // Property routing: label gives us the property, but for Hagihon
      // we may need to override based on account number
      let finalPropertyId = propertyId
      let matchMethod = 'gmail_label'

      if (aiParsedData?.account_number) {
        const accountMatch = (utilityAccounts ?? []).find(
          ua => ua.account_number === aiParsedData.account_number,
        )
        if (accountMatch && accountMatch.property_id !== propertyId) {
          // Account number points to a different property than the label
          // Trust the account number (more specific)
          finalPropertyId = accountMatch.property_id
          matchMethod = 'account_number_override'
        }
      }

      // Anomaly detection
      let isAnomaly = false
      let anomalyNote = null

      if (amountAgorot > 0) {
        const { data: recentBills } = await serviceClient
          .from('bills')
          .select('amount_agorot')
          .eq('property_id', finalPropertyId)
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
          property_id: finalPropertyId,
          bill_type: billType,
          amount_agorot: amountAgorot,
          due_date: dueDate,
          billing_period_start: periodStart,
          billing_period_end: periodEnd,
          status: isAnomaly ? 'flagged' : 'pending_review',
          is_anomaly: isAnomaly,
          anomaly_note: anomalyNote,
          pdf_storage_path: storagePath,
          gmail_message_id: msgRef.id,
          ai_parsed_data: {
            ...aiParsedData,
            match_method: matchMethod,
            gmail_label: label.name,
            email_subject: subject,
            email_from: from,
          },
        })

      if (!billError) parsed++
    }
  }

  return NextResponse.json({
    message: `Parsed ${parsed} bills, skipped ${skipped} already processed`,
    parsed,
    skipped,
    labels_checked: billLabels.length,
  })
}
