import { NextResponse } from 'next/server'
import { getGmailAccessToken } from '@/lib/gmail'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * GET /api/auth/gmail/test
 * Fetch the last 5 emails (no filter) to verify Gmail connection works.
 * Then try the bill search query to compare results.
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
    const BASE = 'https://gmail.googleapis.com/gmail/v1'

    // Test 1: Last 5 emails (no filter)
    const allRes = await fetch(
      `${BASE}/users/me/messages?maxResults=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const allData = await allRes.json()

    const recentEmails = []
    for (const msg of (allData.messages || []).slice(0, 5)) {
      const msgRes = await fetch(
        `${BASE}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (msgRes.ok) {
        const msgData = await msgRes.json()
        const headers = msgData.payload?.headers || []
        recentEmails.push({
          id: msg.id,
          subject: headers.find((h: { name: string }) => h.name === 'Subject')?.value || 'No subject',
          from: headers.find((h: { name: string }) => h.name === 'From')?.value || '',
          date: headers.find((h: { name: string }) => h.name === 'Date')?.value || '',
        })
      }
    }

    // Test 2: Bill search query
    const billQuery = 'has:attachment filename:pdf (from:iec.co.il OR from:hagihon OR from:bezeq OR from:iriya OR arnona OR electricity OR IEC OR water OR "va\'ad bayit" OR חשבון OR ארנונה OR חשמל OR מים OR הגיחון OR בזק OR "חברת החשמל" OR "חשבונית מים" OR "החשבונית החודשית" OR "אישור תשלום" OR "ועד בית" OR "חשבון תקופתי")'
    const billRes = await fetch(
      `${BASE}/users/me/messages?q=${encodeURIComponent(billQuery)}&maxResults=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const billData = await billRes.json()

    const billEmails = []
    for (const msg of (billData.messages || []).slice(0, 5)) {
      const msgRes = await fetch(
        `${BASE}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (msgRes.ok) {
        const msgData = await msgRes.json()
        const headers = msgData.payload?.headers || []
        billEmails.push({
          id: msg.id,
          subject: headers.find((h: { name: string }) => h.name === 'Subject')?.value || 'No subject',
          from: headers.find((h: { name: string }) => h.name === 'From')?.value || '',
          date: headers.find((h: { name: string }) => h.name === 'Date')?.value || '',
        })
      }
    }

    return NextResponse.json({
      connection: 'OK',
      recent_emails: recentEmails,
      recent_count: allData.resultSizeEstimate || allData.messages?.length || 0,
      bill_matches: billEmails,
      bill_count: billData.resultSizeEstimate || billData.messages?.length || 0,
    })
  } catch (err) {
    return NextResponse.json({
      connection: 'FAILED',
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
