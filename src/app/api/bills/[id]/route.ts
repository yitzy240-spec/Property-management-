import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

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
