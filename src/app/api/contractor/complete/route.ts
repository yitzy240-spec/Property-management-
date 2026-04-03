import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAndCheckMagicLink } from '@/lib/magic-links'

/** POST — Complete a task and mark magic link as used (public, token-verified + scoped) */
export async function POST(request: Request) {
  const { token, task_id, expense_agorot } = await request.json()

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

  const serviceClient = createServiceClient()

  // Mark task as completed
  if (task_id) {
    const { error: taskError } = await serviceClient
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        expense_agorot: expense_agorot || 0,
      })
      .eq('id', task_id)

    if (taskError) {
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
    }
  }

  // Mark magic link as used (only after task update succeeds)
  const { error: linkError } = await serviceClient
    .from('magic_links')
    .update({
      is_used: true,
      used_at: new Date().toISOString(),
    })
    .eq('id', payload.magic_link_id)

  if (linkError) {
    return NextResponse.json({ error: 'Failed to close magic link' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
