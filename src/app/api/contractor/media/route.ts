import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAndCheckMagicLink } from '@/lib/magic-links'

/** POST — Log a media upload for a task (public, token-verified + scoped) */
export async function POST(request: Request) {
  const { token, task_id, storage_path, media_type, caption } = await request.json()

  let payload
  try {
    payload = await verifyAndCheckMagicLink(token)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  // Verify task_id matches the token's scope
  if (payload.task_id && task_id !== payload.task_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate media type
  if (!['image', 'video'].includes(media_type)) {
    return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  const { error } = await serviceClient
    .from('task_media')
    .insert({
      task_id,
      storage_path,
      media_type,
      caption: caption || null,
      uploaded_by: 'contractor',
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
