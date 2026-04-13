import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createReceipt, PAYMENT_TYPES } from '@/lib/green-invoice'
import { calculateCcSurcharge } from '@/lib/statements'

const VALID_METHODS = ['credit_card', 'bank_transfer', 'cash', 'check'] as const

/**
 * POST /api/statements/[id]/record-payment
 * Record a payment against a statement and create a Green Invoice receipt.
 * Body: { amount_agorot, payment_method, payment_date, reference?, notes? }
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  let user
  try {
    user = await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { amount_agorot, payment_method, payment_date, reference, notes } = body

  // Input validation
  if (!amount_agorot || !payment_method || !payment_date) {
    return NextResponse.json({ error: 'amount_agorot, payment_method, and payment_date required' }, { status: 400 })
  }

  if (!Number.isInteger(amount_agorot) || amount_agorot <= 0) {
    return NextResponse.json({ error: 'amount_agorot must be a positive integer' }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
    return NextResponse.json({ error: 'payment_date must be YYYY-MM-DD format' }, { status: 400 })
  }

  if (!VALID_METHODS.includes(payment_method)) {
    return NextResponse.json({ error: `Invalid payment_method. Must be one of: ${VALID_METHODS.join(', ')}` }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  const { data: statement, error } = await serviceClient
    .from('monthly_statements')
    .select('*, owners(full_name, email, green_invoice_client_id)')
    .eq('id', params.id)
    .single()

  if (error || !statement) {
    return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  }

  // Status guard — can only record payment on sent/approved/partially_paid statements
  if (statement.status === 'draft' || statement.status === 'pending_approval') {
    return NextResponse.json({ error: 'Statement must be sent before recording payment' }, { status: 400 })
  }
  if (statement.status === 'paid') {
    return NextResponse.json({ error: 'Statement already fully paid' }, { status: 400 })
  }

  const owner = statement.owners as { full_name: string; email: string; green_invoice_client_id: string | null }

  // Map payment method to Green Invoice type
  const giPaymentType = payment_method === 'credit_card'
    ? PAYMENT_TYPES.CREDIT_CARD
    : payment_method === 'cash'
      ? PAYMENT_TYPES.CASH
      : payment_method === 'check'
        ? PAYMENT_TYPES.CHECK
        : PAYMENT_TYPES.BANK_TRANSFER

  // If paying by CC, calculate surcharge
  let totalPayment = amount_agorot
  let surchargeAgorot = 0
  if (payment_method === 'credit_card') {
    surchargeAgorot = calculateCcSurcharge(amount_agorot)
    totalPayment = amount_agorot + surchargeAgorot
  }

  // Create Green Invoice receipt
  let giReceiptId: string | null = null
  let giReceiptNumber: number | null = null

  const monthLabel = new Date(statement.billing_month + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const items = (statement.line_items as Array<{ description: string; amount_agorot: number }>)
    .filter(li => li.amount_agorot !== 0)
    .map(li => ({
      description: li.description,
      quantity: 1,
      priceAgorot: li.amount_agorot,
    }))

  if (surchargeAgorot > 0) {
    items.push({
      description: 'Credit card processing fee (3.5%)',
      quantity: 1,
      priceAgorot: surchargeAgorot,
    })
  }

  try {
    const doc = await createReceipt({
      clientId: owner.green_invoice_client_id || undefined,
      clientName: owner.full_name,
      clientEmail: owner.email,
      items,
      paymentType: giPaymentType,
      paymentDate: payment_date,
      relatedDocumentId: statement.gi_proforma_id || undefined,
      remarks: `Payment for ${monthLabel}${reference ? ` — Ref: ${reference}` : ''}`,
    })
    giReceiptId = doc.id
    giReceiptNumber = doc.number ?? null
  } catch (giErr) {
    console.error('[Record Payment] Green Invoice receipt failed:', giErr)
  }

  // Atomic update FIRST — if this fails, we don't insert the payment record
  const { data: rpcResult, error: rpcErr } = await serviceClient.rpc('record_statement_payment', {
    p_statement_id: params.id,
    p_payment_amount: totalPayment,
    p_surcharge_amount: surchargeAgorot,
    p_payment_method: payment_method,
    p_payment_reference: reference || null,
    p_gi_receipt_id: giReceiptId,
    p_gi_receipt_number: giReceiptNumber,
  })

  if (rpcErr) {
    return NextResponse.json({ error: `Failed to update statement: ${rpcErr.message}` }, { status: 500 })
  }

  // RPC succeeded — now insert the payment record (audit trail)
  const { data: payment, error: payErr } = await serviceClient
    .from('statement_payments')
    .insert({
      statement_id: params.id,
      amount_agorot: totalPayment,
      payment_method,
      payment_date,
      reference,
      gi_receipt_id: giReceiptId,
      gi_receipt_number: giReceiptNumber,
      notes,
      recorded_by: user.id,
    })
    .select()
    .single()

  if (payErr) {
    // RPC already updated totals — log the error but don't fail the request
    console.error('[Record Payment] Payment record insert failed:', payErr)
  }

  const newStatus = rpcResult?.[0]?.new_status ?? 'partially_paid'

  return NextResponse.json({
    message: 'Payment recorded',
    payment_id: payment?.id,
    new_status: newStatus,
    surcharge_agorot: surchargeAgorot,
    gi_receipt_id: giReceiptId,
  })
}
