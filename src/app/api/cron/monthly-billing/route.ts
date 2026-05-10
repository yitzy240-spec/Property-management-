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

    // Look up which owners already have a statement this month so
    // we only fill in the gaps. If the cron retries (or someone
    // already manually generated for some owners), this is idempotent.
    const { data: existing } = await serviceClient
      .from('monthly_statements')
      .select('owner_id')
      .eq('billing_month', billingMonth)
    const ownersWithStatement = new Set((existing ?? []).map(s => s.owner_id))

    const allCalculations = await calculateMonthlyStatements(serviceClient, billingMonth)
    const calculations = allCalculations.filter(c => !ownersWithStatement.has(c.ownerId))

    if (calculations.length === 0) {
      return NextResponse.json({
        message: `All owners already have a statement for ${billingMonth}`,
        billing_month: billingMonth,
        skipped: true,
      })
    }

    const results = await insertStatements(serviceClient, calculations)

    return NextResponse.json({
      message: `Generated ${results.length} new statement(s) for ${billingMonth}`,
      billing_month: billingMonth,
      statements: results.length,
      skipped_existing: ownersWithStatement.size,
    })
  } catch (err) {
    console.error('[Cron:Billing] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
