import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notifications'
import { CLEANING_CHECKLIST } from '@/lib/cleaning-checklist'
import { findOrphanCleaningTaskIds } from '@/lib/cleaning-reconcile'

/**
 * GET /api/cron/cleaning-tasks
 *
 * Auto-creates turnover cleaning tasks for upcoming checkouts (7 days out) and
 * reconciles existing ones: removes pending auto cleaning tasks whose backing
 * checkout moved or was cancelled (otherwise they linger on the calendar as a
 * "Turnover clean" with no matching check-out).
 * Includes next check-in info in description and auto-assigns cleaning contractor.
 * Notifies admin when new tasks are created.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const removed = await reconcileOrphanCleaningTasks(serviceClient)
  if (removed > 0) {
    revalidatePath('/calendar')
    revalidatePath('/tasks')
    revalidatePath('/dashboard')
  }

  const today = new Date()
  const nextWeek = new Date(today)
  nextWeek.setDate(today.getDate() + 7)

  const todayStr = today.toISOString().split('T')[0]
  const nextWeekStr = nextWeek.toISOString().split('T')[0]

  // Batch queries
  const [
    { data: upcomingCheckouts },
    { data: existingCleaningTasks },
    { data: cleaningContractor },
    { data: allUpcoming },
  ] = await Promise.all([
    serviceClient
      .from('bookings')
      .select('id, property_id, check_out, guest_name, properties(name)')
      .gte('check_out', todayStr)
      .lte('check_out', nextWeekStr),
    serviceClient
      .from('tasks')
      .select('property_id, due_date')
      .eq('is_cleaning', true)
      .gte('due_date', todayStr)
      .lte('due_date', nextWeekStr),
    // Find default cleaning contractor
    serviceClient
      .from('contractors')
      .select('id, name')
      .or('name.ilike.%clean%,name.ilike.%sara%')
      .limit(1)
      .single(),
    // Get all upcoming bookings for next-check-in lookup
    serviceClient
      .from('bookings')
      .select('property_id, guest_name, check_in')
      .gte('check_in', todayStr)
      .order('check_in'),
  ])

  if (!upcomingCheckouts || upcomingCheckouts.length === 0) {
    return NextResponse.json({ message: 'No upcoming checkouts', created: 0, removed })
  }

  // Build set of existing cleaning tasks
  const existingSet = new Set(
    (existingCleaningTasks ?? []).map(t => `${t.property_id}_${t.due_date}`)
  )

  // Build next-check-in map per property (after each checkout)
  const nextCheckInMap = new Map<string, { guest: string; date: string }>()
  for (const checkout of upcomingCheckouts) {
    const nextBooking = (allUpcoming ?? []).find(
      b => b.property_id === checkout.property_id && b.check_in > checkout.check_out
    )
    if (nextBooking) {
      nextCheckInMap.set(`${checkout.property_id}_${checkout.check_out}`, {
        guest: nextBooking.guest_name || 'Guest',
        date: nextBooking.check_in,
      })
    }
  }

  // Filter to only checkouts that need a task
  const toCreate = upcomingCheckouts.filter(
    b => !existingSet.has(`${b.property_id}_${b.check_out}`)
  )

  if (toCreate.length === 0) {
    return NextResponse.json({ message: 'All cleaning tasks already exist', created: 0, removed })
  }

  // Create tasks with checklist
  let created = 0

  for (const booking of toCreate) {
    const propertyName = (booking.properties as unknown as { name: string } | null)?.name || 'Unknown'
    const nextCheckIn = nextCheckInMap.get(`${booking.property_id}_${booking.check_out}`)
    const nextInfo = nextCheckIn
      ? `\nNext check-in: ${nextCheckIn.guest} on ${nextCheckIn.date}`
      : '\nNo upcoming check-in scheduled'

    const { data: task, error } = await serviceClient.from('tasks').insert({
      property_id: booking.property_id,
      title: `Turnover clean — ${propertyName}`,
      description: `Post-checkout cleaning for ${booking.guest_name || 'guest'}. Checkout: ${booking.check_out}${nextInfo}`,
      status: 'pending',
      priority: 'high',
      is_cleaning: true,
      due_date: booking.check_out,
      contractor_id: cleaningContractor?.id || null,
    }).select('id').single()

    if (error || !task) continue

    // Attach default cleaning checklist
    await serviceClient.from('task_checklist_items').insert(
      CLEANING_CHECKLIST.map((label, index) => ({
        task_id: task.id,
        label,
        sort_order: index,
      }))
    )

    created++
  }

  // Notify admin
  if (created > 0) {
    revalidatePath('/calendar')
    revalidatePath('/tasks')
    await notifyAdmins({
      title: `${created} turnover task${created > 1 ? 's' : ''} created`,
      body: toCreate.map(b => (b.properties as unknown as { name: string })?.name).join(', '),
      link: '/tasks',
    })
  }

  return NextResponse.json({ message: `Created ${created} cleaning tasks`, created, removed })
}

/**
 * Remove pending auto cleaning tasks (within the calendar's ±1 month window)
 * that no longer line up with a live, non-cancelled checkout — i.e. the booking
 * moved to a different date or was cancelled after the task was created.
 * Only touches `is_cleaning` + `pending` tasks (never started/finished work),
 * and skips entirely if the bookings lookup errors (so a transient failure can
 * never mass-delete tasks). Returns how many tasks were removed.
 */
async function reconcileOrphanCleaningTasks(
  serviceClient: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split('T')[0]

  const [{ data: liveCheckouts, error: bookingsError }, { data: pendingCleanings }] =
    await Promise.all([
      serviceClient
        .from('bookings')
        .select('property_id, check_out')
        .eq('is_cancelled', false)
        .gte('check_out', rangeStart)
        .lte('check_out', rangeEnd),
      serviceClient
        .from('tasks')
        .select('id, property_id, due_date')
        .eq('is_cleaning', true)
        .eq('status', 'pending')
        .gte('due_date', rangeStart)
        .lte('due_date', rangeEnd),
    ])

  // Never delete based on an untrusted (errored/missing) bookings list.
  if (bookingsError || !liveCheckouts) return 0

  const orphanIds = findOrphanCleaningTaskIds(liveCheckouts, pendingCleanings ?? [])
  if (orphanIds.length === 0) return 0

  const { error: deleteError } = await serviceClient.from('tasks').delete().in('id', orphanIds)
  return deleteError ? 0 : orphanIds.length
}
