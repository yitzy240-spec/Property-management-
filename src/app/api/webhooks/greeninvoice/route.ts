import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/webhooks/greeninvoice
 *
 * Green Invoice fires webhooks on document events (creation, payment, cancellation).
 * When an owner pays via a payment link, GI auto-creates a receipt (type 400)
 * and fires this webhook. We match the payment link ID back to our statement
 * and update the status to 'paid'.
 *
 * GI webhook payload includes:
 * - id: document ID
 * - type: document type (300, 400, etc.)
 * - status: 0=draft, 1=final, 2=cancelled
 * - amount: total amount
 * - client: { id, name, emails }
 * - linkedDocuments: related document IDs
 *
 * Security: X-Data-Signature header contains HMAC-SHA256 of the body.
 * For now we log and process — signature verification can be added
 * when we have the webhook secret from GI.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const docId = body.id as string
  const docType = body.type as number
  const docStatus = body.status as number
  const amount = body.amount as number

  console.log(`[GI Webhook] doc=${docId} type=${docType} status=${docStatus} amount=${amount}`)

  if (!docId) {
    return NextResponse.json({ error: 'Missing document ID' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Case 1: Document cancelled/voided (status 2)
  // Find any statement referencing this document and revert to approved
  if (docStatus === 2) {
    const { data: statements } = await serviceClient
      .from('monthly_statements')
      .select('id')
      .or(`gi_proforma_id.eq.${docId},gi_receipt_id.eq.${docId}`)

    if (statements && statements.length > 0) {
      for (const stmt of statements) {
        console.log(`[GI Webhook] Voided doc ${docId} — reverting statement ${stmt.id} to approved`)
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

    return NextResponse.json({ message: 'Voided document processed', affected: statements?.length ?? 0 })
  }

  // Case 2: Receipt created (type 400, status 1 = final)
  // This happens when owner pays via payment link — GI auto-creates the receipt
  if (docType === 400 && docStatus === 1) {
    // Try to match by payment link: the receipt may reference the proforma
    // or we match by client + amount
    const linkedDocs = (body.linkedDocuments || body.relatedDocuments || []) as Array<{ id: string }>
    const linkedIds = linkedDocs.map(d => d.id).filter(Boolean)

    let matched = false

    // Match by linked proforma ID
    if (linkedIds.length > 0) {
      for (const linkedId of linkedIds) {
        const { data: stmt } = await serviceClient
          .from('monthly_statements')
          .select('id, net_amount_agorot')
          .eq('gi_proforma_id', linkedId)
          .single()

        if (stmt) {
          console.log(`[GI Webhook] Payment received for statement ${stmt.id} via linked doc ${linkedId}`)
          await serviceClient
            .from('monthly_statements')
            .update({
              status: 'paid',
              gi_receipt_id: docId,
              paid_at: new Date().toISOString(),
              amount_paid_agorot: Math.abs(stmt.net_amount_agorot),
              payment_method: 'credit_card',
            })
            .eq('id', stmt.id)

          matched = true
          break
        }
      }
    }

    // Fallback: match by amount + sent status (less precise but handles edge cases)
    if (!matched && amount) {
      const amountAgorot = Math.round(amount * 100)
      const { data: candidates } = await serviceClient
        .from('monthly_statements')
        .select('id')
        .eq('status', 'sent')
        .eq('direction', 'owner_owes')
        .eq('net_amount_agorot', amountAgorot)
        .limit(1)

      if (candidates && candidates.length > 0) {
        const stmt = candidates[0]
        console.log(`[GI Webhook] Payment matched by amount (₪${amount}) → statement ${stmt.id}`)
        await serviceClient
          .from('monthly_statements')
          .update({
            status: 'paid',
            gi_receipt_id: docId,
            paid_at: new Date().toISOString(),
            amount_paid_agorot: amountAgorot,
            payment_method: 'credit_card',
          })
          .eq('id', stmt.id)

        matched = true
      }
    }

    return NextResponse.json({ message: 'Receipt processed', matched })
  }

  // Other events — just acknowledge
  return NextResponse.json({ message: 'Webhook received' })
}
