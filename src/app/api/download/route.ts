import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/download?path=bills/abc.pdf&type=bill|document|media
 *
 * Generates a signed download URL for a file in Supabase Storage.
 * Verifies the requesting user has access to the file's associated property.
 */
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const path = url.searchParams.get('path')

  if (!path) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  // Verify the user has access to this file by checking the source record
  // via the user-scoped client (RLS enforced — owners only see their own data)
  let hasAccess = false

  if (path.startsWith('bills/')) {
    // Check bills table — RLS ensures owner only sees approved bills for their properties
    const { data } = await supabase
      .from('bills')
      .select('id')
      .eq('pdf_storage_path', path)
      .limit(1)
    hasAccess = (data?.length ?? 0) > 0
  } else if (path.startsWith('vault/')) {
    // Check documents table — RLS ensures owner only sees their documents
    const { data } = await supabase
      .from('documents')
      .select('id')
      .eq('storage_path', path)
      .limit(1)
    hasAccess = (data?.length ?? 0) > 0
  } else if (path.startsWith('tasks/') || path.startsWith('receipts/')) {
    // Check task_media — RLS ensures owner only sees their property's media
    const { data } = await supabase
      .from('task_media')
      .select('id')
      .eq('storage_path', path)
      .limit(1)
    hasAccess = (data?.length ?? 0) > 0
  }

  if (!hasAccess) {
    return NextResponse.json({ error: 'File not found or access denied' }, { status: 403 })
  }

  // Generate signed URL using service client (Storage doesn't respect RLS)
  const serviceClient = createServiceClient()
  const bucket = path.startsWith('tasks/') || path.startsWith('receipts/') ? 'task-media' : 'documents'

  const { data, error } = await serviceClient.storage
    .from(bucket)
    .createSignedUrl(path, 300)

  if (error || !data) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
