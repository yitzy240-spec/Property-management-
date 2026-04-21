import { NextResponse } from 'next/server'
import { getGmailAccessToken } from '@/lib/gmail'
import { requireAdmin, AuthError } from '@/lib/auth'

const BASE = 'https://gmail.googleapis.com/gmail/v1'

interface GmailLabel {
  id: string
  name: string
  type: string
  messagesTotal?: number
  messagesUnread?: number
}

/**
 * GET /api/gmail/labels
 *
 * Lists all Gmail labels and pulls sample emails from each user-created label.
 * Purpose: verify Sara's per-property label setup and test label-based bill routing.
 */
export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const accessToken = await getGmailAccessToken()

    // Step 1: List all labels
    const labelsRes = await fetch(
      `${BASE}/users/me/labels`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!labelsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 })
    }
    const labelsData = await labelsRes.json()
    const allLabels: GmailLabel[] = labelsData.labels || []

    // Step 2: Filter to user-created labels only (skip INBOX, SENT, SPAM, etc.)
    const userLabels = allLabels.filter(l => l.type === 'user')

    // Step 3: Get details + sample emails for each user label
    const labelResults = []

    for (const label of userLabels) {
      // Get label details (message count)
      const detailRes = await fetch(
        `${BASE}/users/me/labels/${label.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      let messageCount = 0
      if (detailRes.ok) {
        const detail = await detailRes.json()
        messageCount = detail.messagesTotal || 0
      }

      // Pull up to 3 sample emails from this label
      const sampleEmails: { subject: string; from: string; date: string; hasPdf: boolean }[] = []

      if (messageCount > 0) {
        const msgListRes = await fetch(
          `${BASE}/users/me/messages?labelIds=${label.id}&maxResults=3`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (msgListRes.ok) {
          const msgListData = await msgListRes.json()

          for (const msg of (msgListData.messages || []).slice(0, 3)) {
            const msgRes = await fetch(
              `${BASE}/users/me/messages/${msg.id}?format=full`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            )
            if (!msgRes.ok) continue
            const msgData = await msgRes.json()
            const headers = msgData.payload?.headers || []

            // Check for PDF attachment
            let hasPdf = false
            const checkPdf = (parts: { filename?: string; mimeType?: string; parts?: unknown[] }[]) => {
              for (const part of parts) {
                if (part.mimeType === 'application/pdf' || part.filename?.toLowerCase().endsWith('.pdf')) {
                  hasPdf = true
                  return
                }
                if (part.parts) checkPdf(part.parts as typeof parts)
              }
            }
            if (msgData.payload?.parts) checkPdf(msgData.payload.parts)

            sampleEmails.push({
              subject: headers.find((h: { name: string }) => h.name === 'Subject')?.value || '',
              from: headers.find((h: { name: string }) => h.name === 'From')?.value || '',
              date: headers.find((h: { name: string }) => h.name === 'Date')?.value || '',
              hasPdf,
            })
          }
        }
      }

      labelResults.push({
        label_name: label.name,
        label_id: label.id,
        message_count: messageCount,
        sample_emails: sampleEmails,
      })
    }

    // Sort: labels with messages first, then alphabetically
    labelResults.sort((a, b) => {
      if (a.message_count > 0 && b.message_count === 0) return -1
      if (a.message_count === 0 && b.message_count > 0) return 1
      return a.label_name.localeCompare(b.label_name)
    })

    return NextResponse.json({
      total_user_labels: userLabels.length,
      labels: labelResults,
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
