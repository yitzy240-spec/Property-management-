import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAndCheckMagicLink } from '@/lib/magic-links'

/** POST — Toggle a checklist item (public, token-verified + scoped) */
export async function POST(request: Request) {
  const { token, item_id } = await request.json()

  let payload
  try {
    payload = await verifyAndCheckMagicLink(token)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  // Get item and verify it belongs to the token's task
  const { data: item } = await serviceClient
    .from('task_checklist_items')
    .select('task_id, is_completed')
    .eq('id', item_id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  if (payload.task_id && item.task_id !== payload.task_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Toggle
  const { error } = await serviceClient
    .from('task_checklist_items')
    .update({
      is_completed: !item.is_completed,
      completed_at: !item.is_completed ? new Date().toISOString() : null,
    })
    .eq('id', item_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, is_completed: !item.is_completed })
}
