import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { calculateMonthlyStatements } from '@/lib/statements'
import { insertStatements } from '@/lib/statement-insert'

/**
 * GET /api/cron/monthly-billing
 *
 * Runs on the 1st of each month. Auto-generates monthly statements
 * for all owners based on the previous month's activity.
 *
 * Protected by CRON_SECRET header.
 * Vercel cron: schedule "0 6 1 * *" (1st of month at 6am UTC = 9am Jerusalem)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const serviceClient = createServiceClient()

    // Calculate for previous month
    const now = new Date()
    const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const billingMonth = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, '0')}-01`

    // Check if already generated
    const { data: existing } = await serviceClient
      .from('monthly_statements')
      .select('id')
      .eq('billing_month', billingMonth)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ message: `Statements already exist for ${billingMonth}`, skipped: true })
    }

    const calculations = await calculateMonthlyStatements(serviceClient, billingMonth)

    if (calculations.length === 0) {
      return NextResponse.json({ message: 'No billable activity', statements: 0 })
    }

    const results = await insertStatements(serviceClient, calculations)

    return NextResponse.json({
      message: `Generated ${results.length} statements for ${billingMonth}`,
      billing_month: billingMonth,
      statements: results.length,
    })
  } catch (err) {
    console.error('[Cron:Billing] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
