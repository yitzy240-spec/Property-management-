import ICAL from 'ical.js'
import { createServiceClient } from '@/lib/supabase/server'

interface ICalEvent {
  uid: string
  summary: string | null
  dtstart: string
  dtend: string
}

/** Parse an iCal feed string into booking events */
export function parseICalFeed(icalData: string): ICalEvent[] {
  const jcalData = ICAL.parse(icalData)
  const comp = new ICAL.Component(jcalData)
  const events = comp.getAllSubcomponents('vevent')

  return events.map((event) => {
    const vevent = new ICAL.Event(event)
    return {
      uid: vevent.uid,
      summary: vevent.summary || null,
      dtstart: vevent.startDate.toJSDate().toISOString().split('T')[0],
      dtend: vevent.endDate.toJSDate().toISOString().split('T')[0],
    }
  })
}

/** Sync a single property's iCal feeds */
export async function syncPropertyFeeds(
  propertyId: string,
  feeds: { platform: string; url: string }[]
): Promise<{ synced: number; errors: string[] }> {
  const serviceClient = createServiceClient()
  let synced = 0
  const errors: string[] = []

  for (const feed of feeds) {
    let attempts = 0
    const maxRetries = 2

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
        // Sanitize guest name from external feed
        const guestName = event.summary
          ? event.summary.replace(/[<>]/g, '').slice(0, 255)
          : null

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
            },
            { onConflict: 'property_id,ical_uid' }
          )

        if (!error) synced++
      }
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
  }

  return { synced, errors }
}

/** Sync all properties' iCal feeds */
export async function syncAllFeeds(): Promise<{
  total_synced: number
  total_errors: number
  details: { property_id: string; synced: number; errors: string[] }[]
}> {
  const serviceClient = createServiceClient()

  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, ical_feed_urls')
    .eq('is_active', true)

  if (!properties) return { total_synced: 0, total_errors: 0, details: [] }

  const details: { property_id: string; synced: number; errors: string[] }[] = []
  let totalSynced = 0
  let totalErrors = 0

  for (const property of properties) {
    const feeds = (property.ical_feed_urls as { platform: string; url: string }[]) || []
    if (feeds.length === 0) continue

    const result = await syncPropertyFeeds(property.id, feeds)
    details.push({ property_id: property.id, ...result })
    totalSynced += result.synced
    totalErrors += result.errors.length
  }

  return { total_synced: totalSynced, total_errors: totalErrors, details }
}
