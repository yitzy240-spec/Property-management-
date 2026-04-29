import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getGmailAccessToken } from '@/lib/gmail'
import { parseBillPdf, parseBillHtml } from '@/lib/bill-parser'
import { verifyBillRouting } from '@/lib/bill-routing'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'
const PAGE_SIZE = 100
const LOOKBACK_DAYS = 60

/**
 * GET /api/cron/parse-bills
 *
 * Label-based bill routing:
 * 1. Load Gmail label → property mapping from app_settings
 * 2. For each Bill/* label, paginate through emails (last 60 days)
 * 3. Download PDF, upload to storage
 * 4. AI-extract bill data (Claude Sonnet via OpenRouter, Gemini fallback)
 * 5. Property routing via verifyBillRouting helper (label + PDF cross-check)
 * 6. Bills flagged with mismatch confidence are queued for manual review
 * 7. Create bill in verification queue
 */
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional ?days=N override for one-shot backfills. Default = LOOKBACK_DAYS (60).
  const url = new URL(request.url)
  const daysParam = url.searchParams.get('days')
  const lookbackDays = daysParam ? Math.max(1, Math.min(parseInt(daysParam, 10) || LOOKBACK_DAYS, 730)) : LOOKBACK_DAYS

  try {
    return await runParseBills(lookbackDays)
  } catch (err) {
    const e = err as Error
    console.error('[parse-bills] fatal', e?.message, e?.stack)
    return NextResponse.json({
      error: 'parse-bills failed',
      message: e?.message ?? String(err),
      stack: e?.stack?.split('\n').slice(0, 12).join('\n'),
    }, { status: 500 })
  }
}

async function runParseBills(lookbackDays: number) {
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

  // Load utility accounts (with id) and properties for routing verification
  const [{ data: utilityAccounts }, { data: properties }] = await Promise.all([
    serviceClient
      .from('property_utility_accounts')
      .select('id, property_id, utility_type, account_number'),
    serviceClient.from('properties').select('id, address, name'),
  ])

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
  let flaggedMismatches = 0

  const afterDate = gmailQueryDate(lookbackDays)

  for (const label of billLabels) {
    const propertyId = labelToProperty[label.name]

    let pageToken: string | undefined
    let pageNum = 0

    paginate: while (true) {
      pageNum++
      const url = new URL(`${GMAIL_API_BASE}/users/me/messages`)
      url.searchParams.set('labelIds', label.id)
      url.searchParams.set('maxResults', String(PAGE_SIZE))
      url.searchParams.set('q', `after:${afterDate}`)
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const msgListRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!msgListRes.ok) break
      const msgListData = await msgListRes.json()
      const messages: { id: string }[] = msgListData.messages || []

      let pageSeen = 0
      let pageAlreadyInDb = 0
      let pageProcessed = 0

      if (messages.length === 0) {
        console.log(
          `[parse-bills] label=${label.name} page=${pageNum} seen=0 already_in_db=0 processed=0`,
        )
        break
      }

      for (const msgRef of messages) {
        pageSeen++

        // Skip already-processed emails
        const { data: existing } = await serviceClient
          .from('bills')
          .select('id')
          .eq('gmail_message_id', msgRef.id)
          .limit(1)

        if (existing && existing.length > 0) {
          skipped++
          pageAlreadyInDb++
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
              // Use messageId-only key — pdfFilename can be Hebrew (utility companies),
              // and Supabase Storage rejects non-ASCII keys.
              storagePath = `bills/${msgRef.id}.pdf`
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

        // Verified routing: label + PDF cross-check
        const routing = verifyBillRouting({
          labelPropertyId: propertyId,
          parsedPdf: {
            account_number: aiParsedData?.account_number ?? undefined,
            account_holder: aiParsedData?.account_holder ?? undefined,
            address: aiParsedData?.address ?? undefined,
            bill_type: billType,
          },
          utilityAccounts: utilityAccounts ?? [],
          properties: properties ?? [],
        })

        const finalPropertyId = routing.propertyId
        if (routing.confidence === 'mismatch') flaggedMismatches++

        // Anomaly detection (only when we have a property to compare against)
        let isAnomaly = false
        let anomalyNote: string | null = null

        if (finalPropertyId && amountAgorot > 0) {
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

        // Determine status: mismatch always flagged; else anomaly/empty flagged; else approved
        let billStatus: 'approved' | 'flagged' = 'approved'
        if (routing.confidence === 'mismatch') {
          billStatus = 'flagged'
          isAnomaly = true
          anomalyNote = routing.reason ?? 'Routing mismatch — manual review required.'
        } else if (isAnomaly) {
          billStatus = 'flagged'
        } else if (amountAgorot === 0) {
          billStatus = 'flagged'
          isAnomaly = true
          anomalyNote = !storagePath
            ? 'Email notification only — no PDF attached. Amount needs manual entry.'
            : 'AI could not extract amount from this document. Needs manual review.'
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
            status: billStatus,
            is_anomaly: isAnomaly,
            anomaly_note: anomalyNote,
            pdf_storage_path: storagePath,
            gmail_message_id: msgRef.id,
            routing_confidence: routing.confidence,
            ai_parsed_data: {
              ...aiParsedData,
              match_method: routing.signal,
              routing_reason: routing.reason,
              gmail_label: label.name,
              email_subject: subject,
              email_from: from,
            },
          })

        if (!billError) {
          parsed++
          pageProcessed++
        }
      }

      console.log(
        `[parse-bills] label=${label.name} page=${pageNum} seen=${pageSeen} already_in_db=${pageAlreadyInDb} processed=${pageProcessed}`,
      )

      // Early exit: if every message on this page was already in the DB,
      // older pages will be too — no point paginating further.
      if (pageSeen > 0 && pageAlreadyInDb === pageSeen) break paginate

      pageToken = msgListData.nextPageToken
      if (!pageToken) break
    }
  }

  return NextResponse.json({
    message: `Parsed ${parsed} bills, skipped ${skipped} already processed, flagged ${flaggedMismatches} routing mismatches`,
    parsed,
    skipped,
    flagged_mismatches: flaggedMismatches,
    labels_checked: billLabels.length,
  })
}

/** Returns YYYY/MM/DD for Gmail's `q=after:` filter, N days ago. */
function gmailQueryDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
