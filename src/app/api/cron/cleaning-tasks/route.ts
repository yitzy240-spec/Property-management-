import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/cleaning-tasks
 *
 * Auto-creates cleaning tasks for upcoming checkouts.
 * Batch queries to avoid N+1 pattern.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const today = new Date()
  const nextWeek = new Date(today)
  nextWeek.setDate(today.getDate() + 7)

  const todayStr = today.toISOString().split('T')[0]
  const nextWeekStr = nextWeek.toISOString().split('T')[0]

  // Batch: get bookings and existing cleaning tasks in parallel
  const [
    { data: upcomingCheckouts },
    { data: existingCleaningTasks },
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
  ])

  if (!upcomingCheckouts || upcomingCheckouts.length === 0) {
    return NextResponse.json({ message: 'No upcoming checkouts', created: 0 })
  }

  // Build set of existing cleaning tasks for fast lookup
  const existingSet = new Set(
    (existingCleaningTasks ?? []).map(t => `${t.property_id}_${t.due_date}`)
  )

  // Filter to only checkouts that need a cleaning task
  const toCreate = upcomingCheckouts.filter(
    b => !existingSet.has(`${b.property_id}_${b.check_out}`)
  )

  if (toCreate.length === 0) {
    return NextResponse.json({ message: 'All cleaning tasks already exist', created: 0 })
  }

  // Batch insert all new cleaning tasks
  const { error, count } = await serviceClient.from('tasks').insert(
    toCreate.map(booking => {
      const propertyName = (booking.properties as unknown as { name: string } | null)?.name || 'Unknown'
      return {
        property_id: booking.property_id,
        title: `Turnover clean — ${propertyName}`,
        description: `Post-checkout cleaning for ${booking.guest_name || 'guest'}. Checkout date: ${booking.check_out}`,
        status: 'pending',
        priority: 'high',
        is_cleaning: true,
        due_date: booking.check_out,
      }
    })
  )

  const created = error ? 0 : toCreate.length
  return NextResponse.json({ message: `Created ${created} cleaning tasks`, created })
}
