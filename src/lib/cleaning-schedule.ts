/**
 * Shared rules for hand-scheduling cleaning tasks (admin UI + agent API).
 *
 * - schedule_locked: the date was set deliberately → the cron's date-based
 *   reconcile won't delete it for not sitting on a checkout date.
 * - checkout_anchor: the linked booking's checkout at the time the date was
 *   set. If the booking later moves or is cancelled, the cron treats the clean
 *   as stale and replaces it (see /api/cron/cleaning-tasks).
 */
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Extra columns to write when someone changes a task's date. */
export async function dateChangeFields(
  db: ServiceClient,
  task: { due_date?: unknown; booking_id?: unknown },
  newDueDate: string | null | undefined,
): Promise<Record<string, unknown>> {
  if (newDueDate === undefined || newDueDate === (task.due_date ?? null)) return {}
  const fields: Record<string, unknown> = { schedule_locked: true }
  if (typeof task.booking_id === 'string') {
    const { data: booking } = await db.from('bookings').select('check_out').eq('id', task.booking_id).maybeSingle()
    if (booking) fields.checkout_anchor = booking.check_out
  }
  return fields
}

/**
 * For a cleaning created without a booking: link it to that property's most
 * recent live checkout on or before the cleaning date (within 7 days), so the
 * cron sees the checkout as covered and doesn't add a duplicate.
 */
export async function findCheckoutForCleaning(
  db: ServiceClient,
  propertyId: string,
  dueDate: string,
): Promise<{ id: string; check_out: string } | null> {
  const from = new Date(`${dueDate}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 7)
  const { data } = await db
    .from('bookings')
    .select('id, check_out')
    .eq('property_id', propertyId)
    .eq('is_cancelled', false)
    .lte('check_out', dueDate)
    .gte('check_out', from.toISOString().split('T')[0])
    .order('check_out', { ascending: false })
    .limit(1)
  return (data?.[0] as { id: string; check_out: string } | undefined) ?? null
}

/** Today's date in Jerusalem (YYYY-MM-DD) — not the UTC date. */
export function jerusalemToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now)
}
