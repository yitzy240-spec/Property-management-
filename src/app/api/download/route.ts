import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { requireAuth, AuthError } from '@/lib/auth'
import { encodeContentDispositionFilename } from '@/lib/storage'

/**
 * GET /api/download?path=bills/abc.pdf&type=bill|document|media
 *
 * Streams a file from Supabase Storage with a Content-Disposition header that
 * preserves the original (possibly Hebrew) filename via RFC 5987.
 *
 * For vault documents we look up `original_filename` on the documents row;
 * other paths fall back to the storage key basename.
 */
export async function GET(request: Request) {
  try {
    await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const url = new URL(request.url)
  const path = url.searchParams.get('path')

  if (!path) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  // Verify the user has access to this file by checking the source record
  // via the user-scoped client (RLS enforced — owners only see their own data)
  let hasAccess = false
  let downloadFilename: string | null = null

  if (path.startsWith('bills/')) {
    // Check bills table — RLS ensures owner only sees approved bills for their properties
    const { data } = await supabase
      .from('bills')
      .select('id')
      .eq('pdf_storage_path', path)
      .limit(1)
    hasAccess = (data?.length ?? 0) > 0
  } else if (path.startsWith('vault/')) {
    // Check documents table — RLS ensures owner only sees their documents.
    // Pull original_filename + title so we can preserve the Hebrew name on download.
    const { data } = await supabase
      .from('documents')
      .select('id, original_filename, title')
      .eq('storage_path', path)
      .limit(1)
      .maybeSingle()
    if (data) {
      hasAccess = true
      downloadFilename = data.original_filename || data.title || null
    }
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

  // Fetch the file bytes from storage (Storage doesn't respect RLS, use service client)
  const serviceClient = createServiceClient()
  const bucket = path.startsWith('tasks/') || path.startsWith('receipts/') ? 'task-media' : 'documents'

  const { data: fileBlob, error } = await serviceClient.storage
    .from(bucket)
    .download(path)

  if (error || !fileBlob) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Fall back to the basename of the storage key if we don't have a stored
  // filename (e.g., bills, task media, or pre-migration vault rows).
  const fallbackName = path.split('/').pop() || 'download'
  const finalName = downloadFilename || fallbackName

  // ASCII-safe baseline for old browsers + RFC 5987 form for Hebrew/Unicode.
  const asciiSafe = finalName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  const contentDisposition = `attachment; filename="${asciiSafe}"; filename*=${encodeContentDispositionFilename(finalName)}`

  // Stream the body straight through instead of buffering the whole file in
  // serverless RAM — important for large scans/videos. Blob.size is known up
  // front so we can still emit a correct Content-Length.
  return new NextResponse(fileBlob.stream(), {
    status: 200,
    headers: {
      'Content-Type': fileBlob.type || 'application/octet-stream',
      'Content-Length': String(fileBlob.size),
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  })
}
