import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createDocument, createPayoutReceipt, createPaymentLink, getDocumentPdfLinks, DOC_TYPES, PAYMENT_TYPES } from '@/lib/green-invoice'

/**
 * POST /api/statements/[id]/create-invoice
 *
 * owner_owes → Create GI payment link + proforma document.
 * marcus_owes → Create type 400 Receipt documenting the payout.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const serviceClient = createServiceClient()

    const { data: statement, error } = await serviceClient
      .from('monthly_statements')
      .select('*, owners(full_name, email, green_invoice_client_id)')
      .eq('id', params.id)
      .single()

    if (error || !statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
    }

    if (statement.gi_proforma_id) {
      return NextResponse.json({ error: 'Invoice already created for this statement' }, { status: 409 })
    }

    if (statement.status !== 'approved') {
      return NextResponse.json({ error: 'Statement must be approved before creating an invoice' }, { status: 400 })
    }

    const owner = statement.owners as { full_name: string; email: string; green_invoice_client_id: string | null }
    const monthLabel = new Date(statement.billing_month + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

    // Build line items — only charges (positive amounts) for invoicing
    const charges = (statement.line_items as Array<{ description: string; amount_agorot: number; category: string }>)
      .filter(li => li.amount_agorot > 0)

    if (statement.direction === 'owner_owes') {
      const items = charges.map(li => ({
        description: li.description,
        quantity: 1,
        priceAgorot: li.amount_agorot,
      }))

      // 1. Create payment link (hosted payment page)
      const contentText = charges.map(li => li.description).join(', ')
      const paymentLink = await createPaymentLink({
        amountAgorot: Math.abs(statement.net_amount_agorot),
        description: `Marcus Properties — ${monthLabel}`,
        content: contentText.slice(0, 250), // GI may have length limits
      })

      // 2. Create proforma document (draft, no auto-email) for PDF record
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 14)

      let docId: string | null = null
      let docNumber: number | null = null
      let pdfUrl: string | null = null

      try {
        const doc = await createDocument({
          type: DOC_TYPES.PROFORMA,
          clientId: owner.green_invoice_client_id || undefined,
          clientName: owner.full_name,
          clientEmail: owner.email,
          lang: 'en',
          items,
          paymentType: PAYMENT_TYPES.UNPAID,
          remarks: `Marcus Properties — Monthly statement for ${monthLabel}`,
          dueDate: dueDate.toISOString().split('T')[0],
          draft: true,
        })
        docId = doc.id
        docNumber = doc.number

        const pdfLinks = await getDocumentPdfLinks(doc.id)
        pdfUrl = pdfLinks.en || pdfLinks.he || null
      } catch (docErr) {
        // Proforma creation failed — continue with just the payment link
        console.error('[Create Invoice] Proforma creation failed:', docErr)
      }

      await serviceClient
        .from('monthly_statements')
        .update({
          gi_proforma_id: docId || paymentLink.id,
          gi_proforma_number: docNumber,
          gi_proforma_url: paymentLink.url,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', params.id)

      return NextResponse.json({
        message: 'Invoice and payment link created',
        document_id: docId,
        document_number: docNumber,
        payment_url: paymentLink.url,
        short_url: paymentLink.shortUrl,
        pdf_url: pdfUrl,
      })

    } else if (statement.direction === 'marcus_owes') {
      const doc = await createPayoutReceipt({
        clientId: owner.green_invoice_client_id || undefined,
        clientName: owner.full_name,
        clientEmail: owner.email,
        amountAgorot: Math.abs(statement.net_amount_agorot),
        description: `Payout — ${monthLabel} (rental income less management fees)`,
        paymentType: PAYMENT_TYPES.BANK_TRANSFER,
        remarks: `Marcus Properties — Payout for ${monthLabel}`,
      })

      await serviceClient
        .from('monthly_statements')
        .update({
          gi_receipt_id: doc.id,
          gi_receipt_number: doc.number,
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: 'bank_transfer',
        })
        .eq('id', params.id)

      return NextResponse.json({
        message: 'Payout receipt created',
        document_id: doc.id,
        document_number: doc.number,
      })
    }

    return NextResponse.json({ message: 'Zero balance — no invoice needed' })
  } catch (err) {
    console.error('[Create Invoice] Error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: `Failed to create invoice: ${message}` }, { status: 500 })
  }
}
