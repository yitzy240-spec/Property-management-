import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/cleaning-tasks
 *
 * Auto-creates cleaning tasks for upcoming checkouts.
 * Designed to be called by a cron job (Vercel Cron or Supabase Edge Function).
 *
 * Logic: For each booking with checkout in the next 7 days,
 * check if a cleaning task already exists. If not, create one
 * scheduled for the checkout date.
 *
 * Protected by a secret header to prevent unauthorized access.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const today = new Date()
  const nextWeek = new Date(today)
  nextWeek.setDate(today.getDate() + 7)

  // Find bookings with checkout in the next 7 days
  const { data: upcomingCheckouts } = await serviceClient
    .from('bookings')
    .select('id, property_id, check_out, guest_name, properties(name)')
    .gte('check_out', today.toISOString().split('T')[0])
    .lte('check_out', nextWeek.toISOString().split('T')[0])

  if (!upcomingCheckouts || upcomingCheckouts.length === 0) {
    return NextResponse.json({ message: 'No upcoming checkouts', created: 0 })
  }

  let created = 0

  for (const booking of upcomingCheckouts) {
    // Check if a cleaning task already exists for this booking's checkout
    const { data: existingTask } = await serviceClient
      .from('tasks')
      .select('id')
      .eq('property_id', booking.property_id)
      .eq('is_cleaning', true)
      .eq('due_date', booking.check_out)
      .limit(1)

    if (existingTask && existingTask.length > 0) {
      continue // Already has a cleaning task
    }

    const propertyName = (booking.properties as unknown as { name: string } | null)?.name || 'Unknown'

    // Create cleaning task
    const { error } = await serviceClient.from('tasks').insert({
      property_id: booking.property_id,
      title: `Turnover clean — ${propertyName}`,
      description: `Post-checkout cleaning for ${booking.guest_name || 'guest'}. Checkout date: ${booking.check_out}`,
      status: 'pending',
      priority: 'high',
      is_cleaning: true,
      due_date: booking.check_out,
    })

    if (!error) created++
  }

  return NextResponse.json({ message: `Created ${created} cleaning tasks`, created })
}
