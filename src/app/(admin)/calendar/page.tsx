export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function CalendarPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const today = new Date()
  const twoWeeksOut = new Date(today)
  twoWeeksOut.setDate(today.getDate() + 14)

  const todayStr = today.toISOString().split('T')[0]
  const endStr = twoWeeksOut.toISOString().split('T')[0]

  // Get bookings in the next 2 weeks with property info
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, properties(name)')
    .or(`check_in.gte.${todayStr},check_out.gte.${todayStr}`)
    .lte('check_in', endStr)
    .order('check_in')

  // Get cleaning tasks in the next 2 weeks
  const { data: cleaningTasks } = await supabase
    .from('tasks')
    .select('*, properties(name)')
    .eq('is_cleaning', true)
    .in('status', ['pending', 'in_progress'])
    .gte('due_date', todayStr)
    .lte('due_date', endStr)
    .order('due_date')

  // Build a day-by-day view
  const days: { date: string; label: string; events: { type: string; title: string; property: string; detail: string; gapHours?: number }[] }[] = []

  for (let d = new Date(today); d <= twoWeeksOut; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const events: typeof days[0]['events'] = []

    // Check-outs today
    const checkouts = bookings?.filter(b => b.check_out === dateStr) ?? []
    for (const co of checkouts) {
      const propertyName = (co.properties as { name: string } | null)?.name || 'Unknown'
      events.push({
        type: 'checkout',
        title: `Check-out: ${co.guest_name || 'Guest'}`,
        property: propertyName,
        detail: `10:00 AM`,
      })
    }

    // Cleaning tasks today
    const cleans = cleaningTasks?.filter(t => t.due_date === dateStr) ?? []
    for (const clean of cleans) {
      const propertyName = (clean.properties as { name: string } | null)?.name || 'Unknown'
      events.push({
        type: 'cleaning',
        title: clean.title,
        property: propertyName,
        detail: clean.status === 'in_progress' ? 'In progress' : 'Scheduled',
      })
    }

    // Check-ins today
    const checkins = bookings?.filter(b => b.check_in === dateStr) ?? []
    for (const ci of checkins) {
      const propertyName = (ci.properties as { name: string } | null)?.name || 'Unknown'

      // Calculate gap hours from previous checkout at same property
      const prevCheckout = checkouts.find(co =>
        (co.properties as { name: string } | null)?.name === propertyName
      )
      const gapHours = prevCheckout ? 4 : undefined // Simplified: assume 10am checkout, 2pm checkin = 4h

      events.push({
        type: 'checkin',
        title: `Check-in: ${ci.guest_name || 'Guest'}`,
        property: propertyName,
        detail: `2:00 PM · ${ci.check_out ? `→ ${ci.check_out}` : ''}`,
        gapHours,
      })
    }

    if (events.length > 0) {
      days.push({ date: dateStr, label: dayLabel, events })
    }
  }

  const eventTypeColors: Record<string, string> = {
    checkout: 'bg-purple-100 text-purple-800 border-purple-200',
    cleaning: 'bg-gray-100 text-gray-800 border-gray-200',
    checkin: 'bg-blue-100 text-blue-800 border-blue-200',
  }

  const eventTypeLabels: Record<string, string> = {
    checkout: 'Check-out',
    cleaning: 'Cleaning',
    checkin: 'Check-in',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Turnover Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Next 14 days — check-outs, cleaning windows, and check-ins.
        </p>
      </div>

      {days.length > 0 ? (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.date}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                {day.label}
                {day.date === todayStr && (
                  <Badge variant="default" className="ml-2 text-[10px]">Today</Badge>
                )}
              </h3>
              <div className="space-y-2">
                {day.events.map((event, i) => (
                  <Card key={i} className={`border-l-4 ${eventTypeColors[event.type]?.split(' ').pop() || ''}`}>
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${eventTypeColors[event.type]}`}>
                            {eventTypeLabels[event.type]}
                          </Badge>
                          <span className="text-sm font-medium">{event.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {event.property} · {event.detail}
                        </p>
                      </div>
                      {event.gapHours !== undefined && event.gapHours < 5 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {event.gapHours}h gap
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <p className="text-sm text-muted-foreground">No turnovers in the next 14 days</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
