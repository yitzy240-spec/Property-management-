import ICAL from 'ical.js'
import { createServiceClient } from '@/lib/supabase/server'

interface ICalEvent {
  uid: string
  summary: string | null
  dtstart: string
  dtend: string
  status: string | null
}

/** Heuristics for treating an event as a cancellation regardless of
 * iCal STATUS. Airbnb sometimes reuses the slot for a "Not available"
 * block instead of removing the event when a guest cancels; some
 * platforms prefix the SUMMARY with "Cancelled" or similar. */
function summaryLooksCancelled(summary: string | null): boolean {
  if (!summary) return false
  const s = summary.toLowerCase()
  return s.startsWith('cancel') || s.startsWith('canceled') || s.startsWith('cancelled')
}

/** Parse an iCal feed string into booking events. Skips events with
 * STATUS:CANCELLED or a "cancelled" SUMMARY prefix — they're filtered
 * out at parse time so the upsert never sees them. Disappearance
 * (Airbnb's preferred signal) is handled separately by the sync's
 * reconcile pass. */
export function parseICalFeed(icalData: string): ICalEvent[] {
  const jcalData = ICAL.parse(icalData)
  const comp = new ICAL.Component(jcalData)
  const events = comp.getAllSubcomponents('vevent')

  return events
    .map((event) => {
      const vevent = new ICAL.Event(event)
      const start = vevent.startDate
      const end = vevent.endDate
      const dtstart = `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`
      const dtend = `${end.year}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}`
      // ical.js doesn't expose STATUS as a typed property — read it raw.
      const status = (event.getFirstPropertyValue('status') as string | null) ?? null

      return {
        uid: vevent.uid,
        summary: vevent.summary || null,
        dtstart,
        dtend,
        status,
      }
    })
    .filter(e => e.status?.toUpperCase() !== 'CANCELLED' && !summaryLooksCancelled(e.summary))
}

/** Sync a single property's iCal feeds, then reconcile: any DB
 * booking on this property+platform whose UID was NOT in the feed
 * is marked cancelled (Airbnb's preferred cancellation signal is
 * silent removal). UIDs that come back later are un-cancelled. */
export async function syncPropertyFeeds(
  propertyId: string,
  feeds: { platform: string; url: string }[]
): Promise<{ synced: number; cancelled: number; reactivated: number; errors: string[] }> {
  const serviceClient = createServiceClient()
  let synced = 0
  let cancelled = 0
  let reactivated = 0
  const errors: string[] = []

  for (const feed of feeds) {
    let attempts = 0
    const maxRetries = 2
    let feedFetchedSuccessfully = false
    const seenUids = new Set<string>()

    while (attempts <= maxRetries) {
      try {
        const response = await fetch(feed.url, {
          signal: AbortSignal.timeout(30000),
        })

        if (!response.ok) {
          if (attempts < maxRetries && response.status >= 500) {
            attempts++
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempts))) // Exponential backoff
            continue
          }
          errors.push(`${feed.platform}: HTTP ${response.status}`)
          break
        }

      // Guard against oversized responses (1MB max)
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > 1_048_576) {
        errors.push(`${feed.platform}: Response too large (${contentLength} bytes)`)
        break
      }

      const icalData = await response.text()
      if (icalData.length > 1_048_576) {
        errors.push(`${feed.platform}: Response too large`)
        break
      }

      const events = parseICalFeed(icalData)

      for (const event of events) {
        seenUids.add(event.uid)
        // Sanitize guest name from external feed
        const guestName = event.summary
          ? event.summary.replace(/[<>]/g, '').slice(0, 255)
          : null

        // Use update-then-insert instead of upsert so we can clear
        // is_cancelled if a previously-cancelled UID reappears in the
        // feed, but ONLY for that specific UID — we don't want to
        // accidentally un-cancel rows that are still missing.
        const { error } = await serviceClient
          .from('bookings')
          .upsert(
            {
              property_id: propertyId,
              platform: feed.platform,
              ical_uid: event.uid,
              guest_name: guestName,
              check_in: event.dtstart,
              check_out: event.dtend,
              synced_at: new Date().toISOString(),
              is_cancelled: false,
              cancelled_at: null,
            },
            { onConflict: 'property_id,ical_uid' }
          )

        if (!error) synced++
      }
      feedFetchedSuccessfully = true
        break // Success — exit retry loop
      } catch (err) {
        if (attempts < maxRetries) {
          attempts++
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempts)))
          continue
        }
        const message = err instanceof Error ? err.message : 'Unknown error'
        errors.push(`${feed.platform}: ${message}`)
        break
      }
    } // end while (retry loop)

    // Reconcile: only when the feed fetch succeeded. If we couldn't
    // fetch (network error, HTTP 500), assume the absence is transient
    // and DON'T mark anything cancelled — otherwise a single 5xx blip
    // would wipe out the entire booking list.
    if (feedFetchedSuccessfully) {
      const seenList = Array.from(seenUids)
      const { data: missingRows, count } = seenList.length > 0
        ? await serviceClient
            .from('bookings')
            .select('id, ical_uid', { count: 'exact' })
            .eq('property_id', propertyId)
            .eq('platform', feed.platform)
            .eq('is_cancelled', false)
            .not('ical_uid', 'is', null)
            .not('ical_uid', 'in', `(${seenList.map(u => `"${u.replace(/"/g, '\\"')}"`).join(',')})`)
        : await serviceClient
            .from('bookings')
            .select('id, ical_uid', { count: 'exact' })
            .eq('property_id', propertyId)
            .eq('platform', feed.platform)
            .eq('is_cancelled', false)
            .not('ical_uid', 'is', null)

      if (missingRows && missingRows.length > 0) {
        const ids = missingRows.map(r => r.id)
        const { error: cancelErr } = await serviceClient
          .from('bookings')
          .update({ is_cancelled: true, cancelled_at: new Date().toISOString() })
          .in('id', ids)
        if (!cancelErr) cancelled += ids.length
      }
      // Reactivation accounting: count how many rows the upsert above
      // resurrected. Cheap query against the same UID set we just saw.
      if (seenList.length > 0) {
        const { count: reactivatedCount } = await serviceClient
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('property_id', propertyId)
          .eq('platform', feed.platform)
          .eq('is_cancelled', false)
          .gte('cancelled_at', new Date(Date.now() - 60_000).toISOString())
        // (The cancelled_at filter is moot now because the upsert above
        // sets cancelled_at=null, but the reactivated counter is best-
        // effort observability anyway — leave as 0 unless we add a
        // dedicated reactivation tracking column.)
        reactivated += 0 // placeholder; not currently tracked
        void reactivatedCount
      }
    }
  }

  return { synced, cancelled, reactivated, errors }
}

/** Sync all properties' iCal feeds */
export async function syncAllFeeds(): Promise<{
  total_synced: number
  total_cancelled: number
  total_errors: number
  details: { property_id: string; synced: number; cancelled: number; errors: string[] }[]
}> {
  const serviceClient = createServiceClient()

  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, ical_feed_urls')
    .eq('is_active', true)

  if (!properties) return { total_synced: 0, total_cancelled: 0, total_errors: 0, details: [] }

  const details: { property_id: string; synced: number; cancelled: number; errors: string[] }[] = []
  let totalSynced = 0
  let totalCancelled = 0
  let totalErrors = 0

  for (const property of properties) {
    const feeds = (property.ical_feed_urls as { platform: string; url: string }[]) || []
    if (feeds.length === 0) continue

    const result = await syncPropertyFeeds(property.id, feeds)
    details.push({
      property_id: property.id,
      synced: result.synced,
      cancelled: result.cancelled,
      errors: result.errors,
    })
    totalSynced += result.synced
    totalCancelled += result.cancelled
    totalErrors += result.errors.length
  }

  return { total_synced: totalSynced, total_cancelled: totalCancelled, total_errors: totalErrors, details }
}
