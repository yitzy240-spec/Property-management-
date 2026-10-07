import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getDocument, type GIDocument } from '@/lib/green-invoice'

// Green Invoice ids are plain tokens. Anything else (commas, dots, %, parens)
// would be interpreted by the PostgREST .or()/.like() filters below.
const GI_ID = /^[A-Za-z0-9_-]{1,64}$/
function giId(value: unknown): string | null {
  return typeof value === 'string' && GI_ID.test(value) ? value : null
}

/**
 * This endpoint is unauthenticated (Green Invoice signs nothing), so the
 * payload is only a hint: re-fetch the document from Green Invoice with our
 * own API key and act on THAT. A forged or unknown id returns null.
 */
async function fetchVerifiedDocument(id: string): Promise<(GIDocument & { linkedDocuments?: Array<{ id: string }> }) | null> {
  try {
    return await getDocument(id)
  } catch {
    return null
  }
}

/**
 * POST /api/webhooks/greeninvoice
 *
 * Green Invoice fires webhooks on document events.
 * Handles: payment received, document voided, sale-pages/order-paid
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Log full payload for debugging
  console.log('[GI Webhook] Full payload:', JSON.stringify(body).slice(0, 1000))

  const docId = giId(body.id)
  const docType = body.type as number
  const docStatus = body.status as number
  const amount = body.amount as number

  console.log(`[GI Webhook] doc=${docId} type=${docType} status=${docStatus} amount=${amount}`)

  if (body.id !== undefined && !docId) {
    return NextResponse.json({ message: 'Ignored: malformed document id' })
  }

  const serviceClient = createServiceClient()

  // ── Case 1: Document voided (status 2) ──
  if (docStatus === 2 && docId) {
    const verified = await fetchVerifiedDocument(docId)
    if (!verified || verified.status !== 2) {
      console.warn(`[GI Webhook] void for ${docId} not confirmed by Green Invoice — ignored`)
      return NextResponse.json({ message: 'Ignored: void not confirmed by Green Invoice' })
    }
    const { data: statements } = await serviceClient
      .from('monthly_statements')
      .select('id')
      .or(`gi_proforma_id.eq.${docId},gi_receipt_id.eq.${docId}`)

    if (statements && statements.length > 0) {
      for (const stmt of statements) {
        console.log(`[GI Webhook] Voided doc ${docId} — reverting statement ${stmt.id}`)
        await serviceClient
          .from('monthly_statements')
          .update({
            status: 'approved',
            gi_proforma_id: null,
            gi_proforma_number: null,
            gi_proforma_url: null,
            gi_receipt_id: null,
            gi_receipt_number: null,
            paid_at: null,
            sent_at: null,
            payment_method: null,
            amount_paid_agorot: 0,
          })
          .eq('id', stmt.id)
      }
    }

    return NextResponse.json({ message: 'Voided', affected: statements?.length ?? 0 })
  }

  // ── Case 2: Receipt created (type 400, status 1 = final) ──
  // Happens when owner pays via payment link
  if (docType === 400 && docStatus === 1 && docId) {
    const verified = await fetchVerifiedDocument(docId)
    if (!verified || verified.type !== 400 || verified.status !== 1) {
      console.warn(`[GI Webhook] receipt ${docId} not confirmed by Green Invoice — ignored`)
      return NextResponse.json({ message: 'Ignored: receipt not confirmed by Green Invoice', matched: false })
    }
    // Client name comes from the verified document, never the payload.
    const client = verified.client

    let matched = false

    // Strategy 1: Match by linked documents (proforma → receipt)
    const linkedDocs = (verified.linkedDocuments || body.linkedDocuments || body.relatedDocuments || []) as Array<{ id: string }>
    for (const linked of linkedDocs) {
      if (!giId(linked?.id)) continue
      const { data: stmt } = await serviceClient
        .from('monthly_statements')
        .select('id, net_amount_agorot')
        .eq('gi_proforma_id', linked.id)
        .single()

      if (stmt) {
        console.log(`[GI Webhook] Matched by linked proforma ${linked.id} → statement ${stmt.id}`)
        await markStatementPaid(serviceClient, stmt.id, stmt.net_amount_agorot, docId)
        matched = true
        break
      }
    }

    // Strategy 2: Match by client name + sent status
    if (!matched && client?.name) {
      const { data: stmts } = await serviceClient
        .from('monthly_statements')
        .select('id, net_amount_agorot, owners(full_name)')
        .eq('status', 'sent')
        .eq('direction', 'owner_owes')

      if (stmts) {
        const match = stmts.find(s => {
          const ownerName = (s.owners as unknown as { full_name: string } | null)?.full_name
          return ownerName && client.name && ownerName.toLowerCase() === client.name.toLowerCase()
        })
        if (match) {
          console.log(`[GI Webhook] Matched by client name "${client.name}" → statement ${match.id}`)
          await markStatementPaid(serviceClient, match.id, match.net_amount_agorot, docId)
          matched = true
        }
      }
    }

    // Strategy 3: Match any sent owner_owes statement (last resort for single outstanding)
    if (!matched) {
      const { data: sentStmts } = await serviceClient
        .from('monthly_statements')
        .select('id, net_amount_agorot')
        .eq('status', 'sent')
        .eq('direction', 'owner_owes')

      if (sentStmts && sentStmts.length === 1) {
        const stmt = sentStmts[0]
        console.log(`[GI Webhook] Matched single outstanding statement ${stmt.id}`)
        await markStatementPaid(serviceClient, stmt.id, stmt.net_amount_agorot, docId)
        matched = true
      }
    }

    if (!matched) {
      console.log(`[GI Webhook] No matching statement found for receipt ${docId}`)
    }

    return NextResponse.json({ message: 'Receipt processed', matched })
  }

  // ── Case 3: sale-pages/order-paid event ──
  // This fires specifically when a payment link is used
  // The payload may contain different fields than document events
  const event = body.event as string | undefined
  if (event === 'sale-pages/order-paid') {
    const bodyData = body.data as Record<string, unknown> | undefined
    const paymentLinkId = giId(body.paymentLinkId || body.linkId || bodyData?.linkId)
    console.log(`[GI Webhook] order-paid event, linkId=${paymentLinkId}`)

    // The link id is in the payment URL emailed to the owner, so on its own it
    // proves nothing. Only act if the event carries a receipt Green Invoice
    // confirms is real and final. (Real payments also arrive as a receipt
    // document event — Case 2 — which covers this when no receipt id is sent.)
    const receiptId = giId(bodyData?.documentId ?? bodyData?.receiptId) ?? docId
    const receipt = receiptId ? await fetchVerifiedDocument(receiptId) : null
    if (!receipt || receipt.type !== 400 || receipt.status !== 1) {
      console.warn(`[GI Webhook] order-paid for link ${paymentLinkId} has no verified receipt — ignored`)
      return NextResponse.json({ message: 'Ignored: payment not confirmed by Green Invoice' })
    }

    if (paymentLinkId) {
      // Match by payment link URL containing this ID
      const { data: stmts } = await serviceClient
        .from('monthly_statements')
        .select('id, net_amount_agorot')
        .eq('status', 'sent')
        .like('gi_proforma_url', `%${paymentLinkId}%`)

      if (stmts && stmts.length > 0) {
        const stmt = stmts[0]
        console.log(`[GI Webhook] Matched by payment link ID → statement ${stmt.id}`)
        await markStatementPaid(serviceClient, stmt.id, stmt.net_amount_agorot, receipt.id)
        return NextResponse.json({ message: 'Payment link matched', matched: true })
      }
    }
  }

  return NextResponse.json({ message: 'Webhook received' })
}

async function markStatementPaid(
  serviceClient: ReturnType<typeof createServiceClient>,
  statementId: string,
  netAmountAgorot: number,
  receiptId: string,
) {
  await serviceClient
    .from('monthly_statements')
    .update({
      status: 'paid',
      gi_receipt_id: receiptId,
      paid_at: new Date().toISOString(),
      amount_paid_agorot: Math.abs(netAmountAgorot),
      payment_method: 'credit_card',
    })
    .eq('id', statementId)
}
