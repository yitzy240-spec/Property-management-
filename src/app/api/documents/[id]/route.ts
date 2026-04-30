import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * DELETE /api/documents/:id  (admin only)
 *
 * Removes the document row AND the underlying storage object so the
 * vault doesn't leak orphan files. Returns the storage_path that was
 * cleaned up so the client can confirm.
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

  const { data: doc, error: fetchError } = await serviceClient
    .from('documents')
    .select('id, storage_path')
    .eq('id', params.id)
    .single()

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.storage_path) {
    await serviceClient.storage.from('documents').remove([doc.storage_path])
  }

  const { error: deleteError } = await serviceClient
    .from('documents')
    .delete()
    .eq('id', params.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, storagePath: doc.storage_path })
}
