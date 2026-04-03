import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/download?path=bills/abc.pdf
 *
 * Generates a signed download URL for a file in Supabase Storage.
 * Requires authentication. Redirects to the signed URL.
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

  // Determine bucket from path prefix
  const bucket = path.startsWith('bills/') ? 'documents'
    : path.startsWith('tasks/') ? 'task-media'
    : path.startsWith('vault/') ? 'documents'
    : 'documents'

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 300) // 5 minute expiry

  if (error || !data) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
