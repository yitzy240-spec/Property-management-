import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { dateChangeFields } from '@/lib/cleaning-schedule'

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
    revalidatePath('/calendar')
    return NextResponse.json({ success: true })
  }

  // A date changed by hand is deliberate: lock it (and anchor it to the
  // booking's current checkout) so the cleaning cron doesn't delete it for not
  // matching a checkout date. The edit dialog always sends due_date, so only
  // an actual change counts.
  let fields = updates
  if ('due_date' in updates) {
    const { data: current } = await serviceClient.from('tasks').select('due_date, booking_id').eq('id', taskId).maybeSingle()
    if (current) fields = { ...updates, ...(await dateChangeFields(serviceClient, current, updates.due_date)) }
  }

  const { error } = await serviceClient
    .from('tasks')
    .update(fields)
    .eq('id', taskId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Bust the Next.js cache for task pages so detail view shows fresh data,
  // plus the dashboard so its "Open Tasks" banner reflects new status, and the
  // calendar so a cancelled/completed cleaning drops off the turnover view.
  revalidatePath('/tasks')
  revalidatePath(`/tasks/${taskId}`)
  revalidatePath('/dashboard')
  revalidatePath('/calendar')

  return NextResponse.json({ success: true })
}
