import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * PATCH /api/bills/:id  (admin only)
 * 
 * Update bill fields (amount, type, dates, property).
 * Approved bills are locked and cannot be edited.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const body = await request.json()

  // Check if bill is approved (locked)
  const { data: currentBill, error: fetchError } = await serviceClient
    .from('bills')
    .select('status')
    .eq('id', params.id)
    .single()

  if (fetchError || !currentBill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  if (currentBill.status === 'approved') {
    return NextResponse.json({ 
      error: 'Cannot edit approved bills. They may be on owner statements.' 
    }, { status: 409 })
  }

  // Update the bill
  const updateData: Record<string, unknown> = {}
  if (body.amount_agorot !== undefined) updateData.amount_agorot = body.amount_agorot
  if (body.due_date !== undefined) updateData.due_date = body.due_date
  if (body.bill_type !== undefined) updateData.bill_type = body.bill_type
  if (body.property_id !== undefined) updateData.property_id = body.property_id
  if (body.billing_period_start !== undefined) updateData.billing_period_start = body.billing_period_start
  if (body.billing_period_end !== undefined) updateData.billing_period_end = body.billing_period_end

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error: updateError } = await serviceClient
    .from('bills')
    .update(updateData)
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  revalidatePath('/dashboard')
  revalidatePath('/bills')

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/bills/:id  (admin only)
 *
 * Permanently deletes a bill row + its PDF storage object (if any). Use for
 * cleaning up test bills, duplicates, or genuinely-not-bills that came in
 * before routing/extraction was reliable.
 *
 * NOTE: this also removes the bill's `gmail_message_id` from the dedup table,
 * which means the next cron run COULD re-ingest that email. If that's a
 * concern, prefer status='rejected' (kept in DB, dedup keeps working) over
 * actual deletion.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const { data: bill, error: fetchError } = await serviceClient
    .from('bills')
    .select('id, pdf_storage_path')
    .eq('id', params.id)
    .single()

  if (fetchError || !bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  if (bill.pdf_storage_path) {
    await serviceClient.storage.from('documents').remove([bill.pdf_storage_path])
  }

  const { error: deleteError } = await serviceClient
    .from('bills')
    .delete()
    .eq('id', params.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  revalidatePath('/dashboard')
  revalidatePath('/bills')

  return NextResponse.json({ success: true, pdfStoragePath: bill.pdf_storage_path })
}
