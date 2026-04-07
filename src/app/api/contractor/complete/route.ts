import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAndCheckMagicLink } from '@/lib/magic-links'
import { notifyAdmins } from '@/lib/notifications'

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

  // Get task and property info for notifications
  let taskTitle = 'Task'
  let propertyName = 'Property'
  let propertyId = payload.property_id

  if (task_id) {
    const { data: task } = await serviceClient
      .from('tasks')
      .select('title, property_id, properties(name)')
      .eq('id', task_id)
      .single()

    if (task) {
      taskTitle = task.title
      propertyId = task.property_id
      propertyName = (task.properties as unknown as { name: string } | null)?.name || propertyName
    }

    // Mark task as completed
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

  // Create expense bill if contractor logged an expense
  if (expense_agorot && expense_agorot > 0 && propertyId) {
    await serviceClient.from('bills').insert({
      property_id: propertyId,
      bill_type: 'other',
      amount_agorot: expense_agorot,
      status: 'pending_review',
      due_date: new Date().toISOString().split('T')[0],
      ai_parsed_data: {
        source: 'contractor_expense',
        task_id: task_id,
        task_title: taskTitle,
        description: `Contractor expense — ${taskTitle}`,
      },
    })
  }

  // Mark magic link as used
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

  // Notify admin
  const expenseText = expense_agorot && expense_agorot > 0
    ? ` — ₪${(expense_agorot / 100).toFixed(2)} expense logged`
    : ''

  await notifyAdmins({
    title: `Task completed — ${propertyName}`,
    body: `${taskTitle}${expenseText}`,
    link: task_id ? `/tasks/${task_id}` : '/tasks',
  })

  return NextResponse.json({ success: true })
}
