import { NextResponse } from 'next/server'
import { watchGmail } from '@/lib/gmail'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/gmail/watch
 * Start or renew Gmail Pub/Sub watch.
 * Call once to set up, then daily via cron to renew (expires after 7 days).
 */
export async function POST(request: Request) {
  // Allow cron or admin
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    try {
      await requireAdmin()
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await watchGmail()
    return NextResponse.json({
      success: true,
      historyId: result.historyId,
      expiration: result.expiration,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start watch' },
      { status: 500 }
    )
  }
}
