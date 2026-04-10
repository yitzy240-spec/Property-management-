import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { notifyAdmins } from '@/lib/notifications'

/**
 * POST /api/tasks/update — Update task fields (status, contractor, etc.)
 * Uses service client to bypass RLS issues with client-side updates.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId, updates } = await request.json()
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  const serviceClient = createServiceClient()

  // Handle delete
  if (updates._delete) {
    const { error } = await serviceClient.from('tasks').delete().eq('id', taskId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const { error } = await serviceClient
    .from('tasks')
    .update(updates)
    .eq('id', taskId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
