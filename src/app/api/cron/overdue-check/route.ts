import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/overdue-check
 *
 * Runs daily. Marks sent statements as overdue if sent_at is older than 14 days.
 * Protected by CRON_SECRET header.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const serviceClient = createServiceClient()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = cutoff.toISOString()

    const { data, error } = await serviceClient
      .from('monthly_statements')
      .update({ status: 'overdue' })
      .eq('status', 'sent')
      .lt('sent_at', cutoffStr)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      message: `Marked ${data?.length ?? 0} statement(s) as overdue`,
      count: data?.length ?? 0,
    })
  } catch (err) {
    console.error('[Cron:Overdue] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
