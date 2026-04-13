export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { TurnoverCalendar } from '@/components/features/turnover-calendar'

export default async function CalendarPage() {
  const serviceClient = createServiceClient()

  // Fetch a wider range for calendar view (current month +/- 1 month)
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  const startStr = rangeStart.toISOString().split('T')[0]
  const endStr = rangeEnd.toISOString().split('T')[0]

  const [{ data: bookings }, { data: cleaningTasks }] = await Promise.all([
    serviceClient
      .from('bookings')
      .select('id, guest_name, check_in, check_out, platform, properties(name)')
      .or(`check_in.gte.${startStr},check_out.gte.${startStr}`)
      .lte('check_in', endStr)
      .order('check_in'),
    serviceClient
      .from('tasks')
      .select('id, title, status, due_date, is_cleaning, properties(name)')
      .eq('is_cleaning', true)
      .in('status', ['pending', 'in_progress'])
      .gte('due_date', startStr)
      .lte('due_date', endStr)
      .order('due_date'),
  ])

  // Build CalendarEvent array
  const events: { id: string; date: string; type: 'checkout' | 'checkin' | 'cleaning'; title: string; property: string; detail?: string; urgent?: boolean }[] = []

  // Track checkouts per property per date for gap detection
  const checkoutsByPropertyDate = new Map<string, string>()

  for (const b of bookings ?? []) {
    const property = ((b.properties as unknown as { name: string } | null))?.name || 'Unknown'

    if (b.check_out && b.check_out >= startStr && b.check_out <= endStr) {
      events.push({
        id: `co-${b.id}`,
        date: b.check_out,
        type: 'checkout',
        title: `Check-out: ${b.guest_name || 'Guest'}`,
        property,
        detail: '10:00 AM',
      })
      checkoutsByPropertyDate.set(`${property}-${b.check_out}`, b.id)
    }

    if (b.check_in && b.check_in >= startStr && b.check_in <= endStr) {
      // Detect tight gaps (same-day checkout + checkin on same property)
      const hasSameDayCheckout = checkoutsByPropertyDate.has(`${property}-${b.check_in}`)

      events.push({
        id: `ci-${b.id}`,
        date: b.check_in,
        type: 'checkin',
        title: `Check-in: ${b.guest_name || 'Guest'}`,
        property,
        detail: `2:00 PM${b.check_out ? ` · → ${b.check_out}` : ''}`,
        urgent: hasSameDayCheckout, // Same-day turnover = tight gap
      })
    }
  }

  for (const t of cleaningTasks ?? []) {
    if (!t.due_date) continue
    events.push({
      id: `cl-${t.id}`,
      date: t.due_date,
      type: 'cleaning',
      title: t.title,
      property: ((t.properties as unknown as { name: string } | null))?.name || 'Unknown',
      detail: t.status === 'in_progress' ? 'In progress' : 'Scheduled',
    })
  }

  return (
    <div className="space-y-4">
      <TurnoverCalendar events={events} />
    </div>
  )
}
