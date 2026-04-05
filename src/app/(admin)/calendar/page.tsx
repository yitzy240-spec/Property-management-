export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function CalendarPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const today = new Date()
  const twoWeeksOut = new Date(today)
  twoWeeksOut.setDate(today.getDate() + 14)

  const todayStr = today.toISOString().split('T')[0]
  const endStr = twoWeeksOut.toISOString().split('T')[0]

  const { data: bookings } = await serviceClient
    .from('bookings')
    .select('*, properties(name)')
    .or(`check_in.gte.${todayStr},check_out.gte.${todayStr}`)
    .lte('check_in', endStr)
    .order('check_in')

  const { data: cleaningTasks } = await serviceClient
    .from('tasks')
    .select('*, properties(name)')
    .eq('is_cleaning', true)
    .in('status', ['pending', 'in_progress'])
    .gte('due_date', todayStr)
    .lte('due_date', endStr)
    .order('due_date')

  // Build day-by-day view
  const days: { date: string; label: string; events: { type: string; title: string; property: string; detail: string; gapHours?: number }[] }[] = []

  for (let d = new Date(today); d <= twoWeeksOut; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const events: typeof days[0]['events'] = []

    const checkouts = bookings?.filter(b => b.check_out === dateStr) ?? []
    for (const co of checkouts) {
      events.push({
        type: 'checkout',
        title: `Check-out: ${co.guest_name || 'Guest'}`,
        property: (co.properties as { name: string } | null)?.name || 'Unknown',
        detail: '10:00 AM',
      })
    }

    const cleans = cleaningTasks?.filter(t => t.due_date === dateStr) ?? []
    for (const clean of cleans) {
      events.push({
        type: 'cleaning',
        title: clean.title,
        property: (clean.properties as { name: string } | null)?.name || 'Unknown',
        detail: clean.status === 'in_progress' ? 'In progress' : 'Scheduled',
      })
    }

    const checkins = bookings?.filter(b => b.check_in === dateStr) ?? []
    for (const ci of checkins) {
      const propertyName = (ci.properties as { name: string } | null)?.name || 'Unknown'
      const prevCheckout = checkouts.find(co =>
        (co.properties as { name: string } | null)?.name === propertyName
      )
      const gapHours = prevCheckout ? 4 : undefined

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

  const eventTypeMap: Record<string, { label: string; status: string; borderColor: string }> = {
    checkout: { label: 'Check-out', status: 'info', borderColor: 'border-l-[hsl(var(--event-checkout))]' },
    cleaning: { label: 'Cleaning', status: 'neutral', borderColor: 'border-l-[hsl(var(--event-clean))]' },
    checkin: { label: 'Check-in', status: 'info', borderColor: 'border-l-[hsl(var(--event-checkin))]' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Turnover Calendar</h1>
        <p className="text-xs text-muted-foreground">
          Next 14 days — check-outs, cleaning windows, and check-ins.
        </p>
      </div>

      {days.length > 0 ? (
        <>
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.date} id={day.date === todayStr ? 'today' : undefined}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground">{day.label}</h3>
                {day.date === todayStr && (
                  <span className="rounded-[var(--radius-badge)] bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">Today</span>
                )}
              </div>
              <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
                {day.events.map((event, i) => {
                  const config = eventTypeMap[event.type] || eventTypeMap.cleaning
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between border-l-4 px-4 py-3 ${config.borderColor} ${i > 0 ? 'border-t border-border' : ''}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={config.status} label={config.label} size="sm" />
                          <span className="text-sm font-medium">{event.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {event.property} · {event.detail}
                        </p>
                      </div>
                      {event.gapHours !== undefined && event.gapHours < 5 && (
                        <StatusBadge status="danger" label={`${event.gapHours}h gap`} size="sm" />
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        <a
          href="#today"
          className="fixed bottom-24 right-4 z-30 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          Today
        </a>
        </>
      ) : (
        <div className="rounded-[10px] border border-border bg-card py-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">No turnovers in the next 14 days</p>
        </div>
      )}
    </div>
  )
}
