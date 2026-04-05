import { NextResponse } from 'next/server'
import { syncLodgifyBookings } from '@/lib/lodgify'

/**
 * GET /api/cron/lodgify-sync
 *
 * Syncs bookings + financial data from Lodgify API.
 * Runs every 2 hours via Vercel Cron (lighter than iCal since Lodgify is API, not feed polling).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncLodgifyBookings()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: 'Lodgify sync failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
