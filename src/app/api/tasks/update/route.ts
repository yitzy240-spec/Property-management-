import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/tasks/update — Update task fields (status, contractor, etc.)
 * Uses service client to bypass RLS issues with client-side updates.
 * Revalidates task pages to prevent stale cache.
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
    revalidatePath('/tasks')
    revalidatePath('/dashboard')
    return NextResponse.json({ success: true })
  }

  const { error } = await serviceClient
    .from('tasks')
    .update(updates)
    .eq('id', taskId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Bust the Next.js cache for task pages so detail view shows fresh data,
  // plus the dashboard so its "Open Tasks" banner reflects new status.
  revalidatePath('/tasks')
  revalidatePath(`/tasks/${taskId}`)
  revalidatePath('/dashboard')

  return NextResponse.json({ success: true })
}
