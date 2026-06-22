/**
 * Reconciliation helper for auto-generated turnover cleaning tasks.
 *
 * Cleaning tasks are auto-created (one per booking checkout) by the
 * `/api/cron/cleaning-tasks` job and shown 1:1 on the Turnover Calendar.
 * When a booking's checkout date changes or the booking is cancelled, the
 * originally-created cleaning task is left stranded — it keeps showing on the
 * calendar even though no checkout backs it (e.g. a "Turnover clean" on a day
 * with no check-out). This finds those orphans so the cron can remove them.
 *
 * Safety: callers must only pass PENDING cleaning tasks (never started/done)
 * and a TRUSTED list of live (non-cancelled) checkouts. A task is an orphan
 * only when no live checkout shares its property + date.
 */

export interface LiveCheckout {
  property_id: string
  check_out: string | null
}

export interface PendingCleaningTask {
  id: string
  property_id: string
  due_date: string | null
}

/** Returns the ids of cleaning tasks that no longer match any live checkout. */
export function findOrphanCleaningTaskIds(
  liveCheckouts: LiveCheckout[],
  pendingCleanings: PendingCleaningTask[],
): string[] {
  const liveKeys = new Set(
    liveCheckouts
      .filter((b) => b.check_out)
      .map((b) => `${b.property_id}_${b.check_out}`),
  )
  return pendingCleanings
    .filter((t) => t.due_date && !liveKeys.has(`${t.property_id}_${t.due_date}`))
    .map((t) => t.id)
}
