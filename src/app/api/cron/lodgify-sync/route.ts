import { NextResponse } from 'next/server'
import { syncLodgifyBookings } from '@/lib/lodgify'

/**
 * GET /api/cron/lodgify-sync
 *
 * Syncs bookings + financial data from Lodgify API.
 * Runs daily at 07:00 UTC via Vercel Cron (Hobby plan allows daily crons only).
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
