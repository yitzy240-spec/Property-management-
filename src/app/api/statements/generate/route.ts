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

  // Find owners who already have at least one statement this month —
  // we only fill in the gaps. Re-runnable, doesn't duplicate. (The
  // unique constraint on (owner_id, billing_month) was dropped in
  // migration 00029, so admin can still add additional statements
  // for an owner manually; this auto-generation just stays one-per-
  // owner-per-month so it doesn't pile on duplicates.)
  const { data: existing } = await serviceClient
    .from('monthly_statements')
    .select('owner_id')
    .eq('billing_month', billing_month)
  const ownersWithStatement = new Set((existing ?? []).map(s => s.owner_id))

  const allCalculations = await calculateMonthlyStatements(serviceClient, billing_month)
  const calculations = allCalculations.filter(c => !ownersWithStatement.has(c.ownerId))

  if (calculations.length === 0) {
    return NextResponse.json({
      message: 'All owners already have a statement for this month',
      statements: 0,
      skipped_existing: ownersWithStatement.size,
    })
  }

  const results = await insertStatements(serviceClient, calculations)

  return NextResponse.json({
    message: `Generated ${results.length} statement(s)`,
    statements: results,
    skipped_existing: ownersWithStatement.size,
  })
}
