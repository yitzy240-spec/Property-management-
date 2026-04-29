import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyMagicLinkToken } from '@/lib/magic-links'
import { buildStorageKey } from '@/lib/storage'

/**
 * POST /api/contractor/upload
 * Upload a photo/receipt via service client (bypasses storage RLS).
 */
export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const token = formData.get('token') as string
  const taskId = formData.get('task_id') as string
  const mediaType = formData.get('media_type') as string || 'image'
  const caption = formData.get('caption') as string || null

  if (!file || !token) {
    return NextResponse.json({ error: 'file and token required' }, { status: 400 })
  }

  // Verify magic link
  try {
    await verifyMagicLinkToken(token)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const folder = caption === 'Expense receipt' ? 'receipts' : 'tasks'
  // Build a safe ASCII storage key — file.name may be Hebrew or contain spaces.
  const { key: filePath } = buildStorageKey(`${folder}/${taskId}`, file.name)

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await serviceClient.storage
    .from('task-media')
    .upload(filePath, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Store media record
  if (taskId) {
    await serviceClient.from('task_media').insert({
      task_id: taskId,
      storage_path: filePath,
      media_type: mediaType,
      caption,
      uploaded_by: 'contractor',
    })
  }

  return NextResponse.json({ success: true, path: filePath })
}
