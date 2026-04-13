import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/statements/[id]/void-invoice
 * Void/reset the invoice on a statement — clears GI references and reverts to approved.
 * Use when a GI document has been cancelled/voided and needs to be re-issued.
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

  const serviceClient = createServiceClient()

  const { data: statement, error } = await serviceClient
    .from('monthly_statements')
    .select('id, status, gi_proforma_id, gi_receipt_id')
    .eq('id', params.id)
    .single()

  if (error || !statement) {
    return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  }

  if (!statement.gi_proforma_id && !statement.gi_receipt_id) {
    return NextResponse.json({ error: 'No invoice to void' }, { status: 400 })
  }

  const { error: updateErr } = await serviceClient
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
    .eq('id', params.id)

  if (updateErr) {
    return NextResponse.json({ error: `Failed to void: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ message: 'Invoice voided — statement reverted to approved' })
}
