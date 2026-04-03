import { NextResponse } from 'next/server'
import { syncAllFeeds } from '@/lib/ical-sync'

/**
 * GET /api/cron/ical-sync
 *
 * Syncs iCal feeds from Airbnb, Booking.com, Lodgify for all active properties.
 * Runs every 30 minutes via Vercel Cron.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncAllFeeds()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: 'iCal sync failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
