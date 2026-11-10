import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { computeChecklistUpdate } from '@/lib/checklist-update'

/**
 * POST /api/tasks/checklist — Set a task checklist item to a specific completed state (admin only).
 * Uses service client to bypass RLS.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId, isCompleted } = await request.json()
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })
  if (typeof isCompleted !== 'boolean') {
    return NextResponse.json({ error: 'isCompleted (boolean) required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  const { data: item } = await serviceClient
    .from('task_checklist_items')
    .select('id')
    .eq('id', itemId)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const { error } = await serviceClient
    .from('task_checklist_items')
    .update(computeChecklistUpdate(isCompleted))
    .eq('id', itemId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, is_completed: isCompleted })
}
