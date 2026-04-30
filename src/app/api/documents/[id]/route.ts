import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { assertNotImpersonating } from '@/lib/impersonation'

/**
 * DELETE /api/documents/:id
 *
 * - Admins: can delete any document.
 * - Owners: can delete only documents tied to a property they own OR
 *   their own owner_id.
 * - Blocked entirely while admin is impersonating (read-only contract).
 *
 * Removes the document row AND the underlying storage object so the
 * vault doesn't leak orphan files.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Block deletes while impersonating — same contract as other mutations.
  try {
    assertNotImpersonating(cookies())
  } catch (err) {
    if (err instanceof Error && (err as Error & { status?: number }).status === 403) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    throw err
  }

  const serviceClient = createServiceClient()
  const role = user.app_metadata?.role
  const isAdmin = role === 'admin' ||
    (process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL)

  const { data: doc, error: fetchError } = await serviceClient
    .from('documents')
    .select('id, storage_path, property_id, owner_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Owner authorization: must own either the property or the document directly.
  if (!isAdmin) {
    const { data: ownerRow } = await serviceClient
      .from('owners')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!ownerRow) {
      return NextResponse.json({ error: 'Owner not found' }, { status: 403 })
    }
    let allowed = doc.owner_id === ownerRow.id
    if (!allowed && doc.property_id) {
      const { data: prop } = await serviceClient
        .from('properties')
        .select('id')
        .eq('id', doc.property_id)
        .eq('owner_id', ownerRow.id)
        .single()
      allowed = !!prop
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Not your document' }, { status: 403 })
    }
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
