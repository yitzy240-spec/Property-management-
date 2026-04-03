import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { formatILS } from '@/lib/utils'

/**
 * POST /api/reports/quarterly
 *
 * Generates a quarterly financial summary for an owner.
 * Returns structured data that can be rendered as HTML, PDF, or emailed.
 *
 * Body: { owner_id: string, quarter: number (1-4), year: number }
 */
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { owner_id, quarter, year } = await request.json()
  if (!owner_id || !quarter || !year) {
    return NextResponse.json({ error: 'owner_id, quarter, and year required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Calculate date range for the quarter
  const startMonth = (quarter - 1) * 3 // 0, 3, 6, 9
  const startDate = new Date(year, startMonth, 1)
  const endDate = new Date(year, startMonth + 3, 1)
  const startStr = startDate.toISOString().split('T')[0]
  const endStr = endDate.toISOString().split('T')[0]

  // Get owner
  const { data: owner } = await serviceClient
    .from('owners')
    .select('full_name, email, profile')
    .eq('id', owner_id)
    .single()

  if (!owner) {
    return NextResponse.json({ error: 'Owner not found' }, { status: 404 })
  }

  // Get owner's properties
  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, name, address')
    .eq('owner_id', owner_id)

  if (!properties || properties.length === 0) {
    return NextResponse.json({ error: 'No properties for this owner' }, { status: 404 })
  }

  const propertyIds = properties.map((p) => p.id)

  // Get bookings for the quarter
  const { data: bookings } = await serviceClient
    .from('bookings')
    .select('property_id, gross_rental_agorot, channel_fees_agorot, check_in, check_out, platform')
    .in('property_id', propertyIds)
    .gte('check_out', startStr)
    .lt('check_out', endStr)

  // Get bills for the quarter
  const { data: bills } = await serviceClient
    .from('bills')
    .select('property_id, bill_type, amount_agorot')
    .in('property_id', propertyIds)
    .eq('status', 'approved')
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString())

  // Get fee entries for the quarter
  const { data: fees } = await serviceClient
    .from('fee_entries')
    .select('property_id, fee_type, amount_agorot')
    .in('property_id', propertyIds)
    .gte('billing_month', startStr)
    .lt('billing_month', endStr)

  // Get tasks completed this quarter
  const { data: tasks } = await serviceClient
    .from('tasks')
    .select('property_id, title, expense_agorot')
    .in('property_id', propertyIds)
    .eq('status', 'completed')
    .gte('completed_at', startDate.toISOString())
    .lt('completed_at', endDate.toISOString())

  // Build per-property summaries
  const propertySummaries = properties.map((property) => {
    const propBookings = (bookings ?? []).filter((b) => b.property_id === property.id)
    const propBills = (bills ?? []).filter((b) => b.property_id === property.id)
    const propFees = (fees ?? []).filter((f) => f.property_id === property.id)
    const propTasks = (tasks ?? []).filter((t) => t.property_id === property.id)

    const grossRevenue = propBookings.reduce((s, b) => s + (b.gross_rental_agorot ?? 0), 0)
    const channelFees = propBookings.reduce((s, b) => s + (b.channel_fees_agorot ?? 0), 0)
    const totalBills = propBills.reduce((s, b) => s + b.amount_agorot, 0)
    const totalMgmtFees = propFees.reduce((s, f) => s + f.amount_agorot, 0)
    const totalExpenses = propTasks.reduce((s, t) => s + (t.expense_agorot ?? 0), 0)

    const netIncome = grossRevenue - channelFees - totalBills - totalMgmtFees - totalExpenses

    return {
      property_name: property.name,
      property_address: property.address,
      bookings_count: propBookings.length,
      gross_revenue_agorot: grossRevenue,
      channel_fees_agorot: channelFees,
      bills_agorot: totalBills,
      management_fees_agorot: totalMgmtFees,
      maintenance_expenses_agorot: totalExpenses,
      net_income_agorot: netIncome,
      bills_breakdown: propBills.reduce<Record<string, number>>((acc, b) => {
        acc[b.bill_type] = (acc[b.bill_type] || 0) + b.amount_agorot
        return acc
      }, {}),
    }
  })

  // Portfolio totals
  const totals = propertySummaries.reduce(
    (acc, p) => ({
      gross_revenue: acc.gross_revenue + p.gross_revenue_agorot,
      channel_fees: acc.channel_fees + p.channel_fees_agorot,
      bills: acc.bills + p.bills_agorot,
      management_fees: acc.management_fees + p.management_fees_agorot,
      maintenance: acc.maintenance + p.maintenance_expenses_agorot,
      net_income: acc.net_income + p.net_income_agorot,
      bookings: acc.bookings + p.bookings_count,
    }),
    { gross_revenue: 0, channel_fees: 0, bills: 0, management_fees: 0, maintenance: 0, net_income: 0, bookings: 0 }
  )

  const quarterLabel = `Q${quarter} ${year}`

  return NextResponse.json({
    report: {
      owner_name: owner.full_name,
      owner_email: owner.email,
      quarter: quarterLabel,
      period: { start: startStr, end: endStr },
      totals_agorot: totals,
      properties: propertySummaries,
      generated_at: new Date().toISOString(),
    },
  })
}
