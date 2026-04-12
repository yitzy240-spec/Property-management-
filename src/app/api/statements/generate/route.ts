import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { calculateMonthlyStatements } from '@/lib/statements'
import { insertStatements } from '@/lib/statement-insert'

/**
 * POST /api/statements/generate
 * Calculate and create monthly statements for all owners.
 * Body: { billing_month: "2026-04-01" }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { billing_month } = await request.json()
  if (!billing_month || !/^\d{4}-\d{2}-01$/.test(billing_month)) {
    return NextResponse.json({ error: 'billing_month required (format: YYYY-MM-01)' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Check for existing statements this month
  const { data: existing } = await serviceClient
    .from('monthly_statements')
    .select('id, owner_id')
    .eq('billing_month', billing_month)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: `Statements already exist for ${billing_month}. Delete them first to regenerate.`, existing: existing.length },
      { status: 409 }
    )
  }

  // Calculate statements
  const calculations = await calculateMonthlyStatements(serviceClient, billing_month)

  if (calculations.length === 0) {
    return NextResponse.json({ message: 'No billable activity found for this month', statements: 0 })
  }

  const results = await insertStatements(serviceClient, calculations)

  return NextResponse.json({
    message: `Generated ${results.length} statement(s)`,
    statements: results,
  })
}
