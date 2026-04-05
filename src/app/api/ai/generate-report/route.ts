import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { callGemini } from '@/lib/ai'
import { formatILS } from '@/lib/utils'

/**
 * POST /api/ai/generate-report
 * Generates a quarterly owner report with AI narrative.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { owner_id, quarter, year } = await request.json()
  if (!owner_id || !quarter || !year) {
    return NextResponse.json({ error: 'owner_id, quarter, and year required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Calculate date range
  const startMonth = (quarter - 1) * 3
  const startDate = new Date(year, startMonth, 1)
  const endDate = new Date(year, startMonth + 3, 1)
  const startStr = startDate.toISOString().split('T')[0]
  const endStr = endDate.toISOString().split('T')[0]

  const { data: owner } = await serviceClient
    .from('owners')
    .select('full_name, email, profile')
    .eq('id', owner_id)
    .single()

  if (!owner) return NextResponse.json({ error: 'Owner not found' }, { status: 404 })

  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, name, address')
    .eq('owner_id', owner_id)

  if (!properties?.length) return NextResponse.json({ error: 'No properties' }, { status: 404 })

  const propertyIds = properties.map(p => p.id)

  const [
    { data: bookings },
    { data: bills },
    { data: fees },
    { data: tasks },
  ] = await Promise.all([
    serviceClient.from('bookings').select('property_id, gross_rental_agorot, channel_fees_agorot, check_in, check_out, platform, guest_name')
      .in('property_id', propertyIds).gte('check_out', startStr).lt('check_out', endStr),
    serviceClient.from('bills').select('property_id, bill_type, amount_agorot')
      .in('property_id', propertyIds).eq('status', 'approved')
      .gte('created_at', startDate.toISOString()).lt('created_at', endDate.toISOString()),
    serviceClient.from('fee_entries').select('property_id, fee_type, amount_agorot')
      .in('property_id', propertyIds).gte('billing_month', startStr).lt('billing_month', endStr),
    serviceClient.from('tasks').select('property_id, title, status, expense_agorot, is_cleaning, is_seasonal')
      .in('property_id', propertyIds)
      .gte('created_at', startDate.toISOString()).lt('created_at', endDate.toISOString()),
  ])

  // Build per-property summaries
  const propertySummaries = properties.map(property => {
    const pb = (bookings ?? []).filter(b => b.property_id === property.id)
    const pBills = (bills ?? []).filter(b => b.property_id === property.id)
    const pFees = (fees ?? []).filter(f => f.property_id === property.id)
    const pTasks = (tasks ?? []).filter(t => t.property_id === property.id)

    const gross = pb.reduce((s, b) => s + (b.gross_rental_agorot ?? 0), 0)
    const channelFees = pb.reduce((s, b) => s + (b.channel_fees_agorot ?? 0), 0)
    const totalBills = pBills.reduce((s, b) => s + b.amount_agorot, 0)
    const mgmtFees = pFees.reduce((s, f) => s + f.amount_agorot, 0)
    const expenses = pTasks.reduce((s, t) => s + (t.expense_agorot ?? 0), 0)

    return {
      property_name: property.name,
      bookings_count: pb.length,
      gross_revenue_agorot: gross,
      channel_fees_agorot: channelFees,
      bills_agorot: totalBills,
      management_fees_agorot: mgmtFees,
      maintenance_expenses_agorot: expenses,
      net_income_agorot: gross - channelFees - totalBills - mgmtFees - expenses,
      tasks_completed: pTasks.filter(t => t.status === 'completed').length,
      cleaning_turnovers: pTasks.filter(t => t.is_cleaning).length,
    }
  })

  const reportData = {
    owner_name: owner.full_name,
    quarter: `Q${quarter} ${year}`,
    period: { start: startStr, end: endStr },
    properties: propertySummaries,
  }

  // Generate AI narratives — format agorot as ILS for readability in the prompt
  const formattedForAI = {
    ...reportData,
    properties: propertySummaries.map(p => ({
      ...p,
      gross_revenue: formatILS(p.gross_revenue_agorot),
      channel_fees: formatILS(p.channel_fees_agorot),
      bills: formatILS(p.bills_agorot),
      management_fees: formatILS(p.management_fees_agorot),
      maintenance_expenses: formatILS(p.maintenance_expenses_agorot),
      net_income: formatILS(p.net_income_agorot),
    })),
  }
  const dataStr = JSON.stringify(formattedForAI, null, 2)

  const [narrativeEn, narrativeHe] = await Promise.all([
    callGemini('pro', [{
      parts: [{
        text: `You are a professional property manager writing a quarterly report letter to ${owner.full_name}, a property owner in Jerusalem. Write in English.

Here is the structured data for Q${quarter} ${year}:
${dataStr}

Write a warm, professional quarterly report (250-350 words) covering:
1. Executive summary — how the portfolio performed
2. Revenue highlights and occupancy
3. Notable expenses or maintenance work completed
4. Brief outlook for next quarter

Use actual numbers from the data. Address the owner by first name. Sign off as "Marcus Properties".`,
      }],
    }]),
    callGemini('pro', [{
      parts: [{
        text: `You are a professional property manager writing a quarterly report letter to ${owner.full_name}, a property owner in Jerusalem. Write in Hebrew.

Here is the structured data for Q${quarter} ${year}:
${dataStr}

Write a warm, professional quarterly report in Hebrew (250-350 words) covering:
1. סיכום ביצועים — ביצועי התיק
2. הכנסות ותפוסה
3. הוצאות ותחזוקה שבוצעה
4. תחזית לרבעון הבא

Use actual numbers from the data. Address the owner by first name. Sign off as "Marcus Properties — ניהול נכסים".`,
      }],
    }]),
  ])

  // Save to owner_reports table
  const { data: report, error } = await serviceClient
    .from('owner_reports')
    .upsert({
      owner_id,
      quarter,
      year,
      report_data: reportData,
      ai_narrative_en: narrativeEn,
      ai_narrative_he: narrativeHe,
      status: 'draft',
    }, { onConflict: 'owner_id,quarter,year' })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    report_id: report.id,
    narrative_en: narrativeEn,
    narrative_he: narrativeHe,
  })
}
