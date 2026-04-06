import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createDocument, DOC_TYPES, PAYMENT_TYPES } from '@/lib/green-invoice'

/**
 * POST /api/invoices/compile
 * Compile a monthly invoice for an owner — aggregates:
 * 1. Utility bills (approved, for that month)
 * 2. Billable hours (work_logs, uninvoiced)
 * 3. Commission from bookings (optional)
 *
 * Creates a DRAFT that Marcus reviews before sending.
 *
 * Body: { owner_id, month: "2026-04", send?: boolean }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { owner_id, month, send } = await request.json()

  if (!owner_id || !month) {
    return NextResponse.json({ error: 'owner_id and month (YYYY-MM) required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Get owner
  const { data: owner } = await serviceClient
    .from('owners')
    .select('id, full_name, email, green_invoice_client_id')
    .eq('id', owner_id)
    .single()

  if (!owner) {
    return NextResponse.json({ error: 'Owner not found' }, { status: 404 })
  }

  // Get owner's properties
  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, name, commission_rate, hourly_rate_agorot, management_fee_agorot')
    .eq('owner_id', owner_id)
    .eq('is_active', true)

  if (!properties || properties.length === 0) {
    return NextResponse.json({ error: 'No active properties for this owner' }, { status: 400 })
  }

  const propertyIds = properties.map(p => p.id)
  const monthStart = `${month}-01`
  const nextMonth = new Date(monthStart)
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const monthEnd = nextMonth.toISOString().split('T')[0]
  const monthLabel = new Date(monthStart).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── 1. Utility bills ──
  const { data: bills } = await serviceClient
    .from('bills')
    .select('*, properties(name)')
    .in('property_id', propertyIds)
    .eq('status', 'approved')
    .gte('created_at', monthStart)
    .lt('created_at', monthEnd)

  // ── 2. Work logs (uninvoiced billable hours) ──
  const { data: workLogs } = await serviceClient
    .from('work_logs')
    .select('*, properties(name)')
    .in('property_id', propertyIds)
    .eq('billable', true)
    .eq('invoiced', false)
    .gte('date', monthStart)
    .lt('date', monthEnd)

  // Commission excluded — Marcus handles externally with criteria not in the app

  // ── Build line items ──
  const lineItems: { description: string; priceAgorot: number; quantity: number }[] = []

  // Bills
  for (const bill of bills ?? []) {
    const propName = (bill.properties as { name: string } | null)?.name || ''
    const typeLabels: Record<string, string> = {
      arnona: 'Arnona', iec: 'Electricity', water: 'Water',
      vaad_bayit: "Va'ad Bayit", internet: 'Internet', gas: 'Gas', other: 'Other',
    }
    lineItems.push({
      description: `${typeLabels[bill.bill_type] || bill.bill_type} — ${propName}`,
      priceAgorot: bill.amount_agorot,
      quantity: 1,
    })
  }

  // Hourly work
  for (const property of properties) {
    const propLogs = (workLogs ?? []).filter(w => w.property_id === property.id)
    if (propLogs.length === 0) continue

    const totalHours = propLogs.reduce((s, w) => s + Number(w.hours), 0)
    const rate = property.hourly_rate_agorot || 0

    if (rate > 0 && totalHours > 0) {
      lineItems.push({
        description: `Hourly services — ${property.name} (${totalHours}h × ₪${(rate / 100).toFixed(0)}/h)`,
        priceAgorot: Math.round(totalHours * rate),
        quantity: 1,
      })
    }
  }

  // Management fees
  for (const property of properties) {
    if (property.management_fee_agorot && property.management_fee_agorot > 0) {
      lineItems.push({
        description: `Monthly management fee — ${property.name}`,
        priceAgorot: property.management_fee_agorot,
        quantity: 1,
      })
    }
  }

  // Commission excluded — Marcus handles externally

  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'No billable items for this period', lineItems: [] }, { status: 400 })
  }

  const totalAgorot = lineItems.reduce((s, item) => s + item.priceAgorot * item.quantity, 0)

  // ── Create invoice (or return preview) ──
  if (send) {
    try {
      const doc = await createDocument({
        type: DOC_TYPES.RECEIPT,
        clientName: owner.full_name,
        clientEmail: owner.email,
        clientId: owner.green_invoice_client_id || undefined,
        items: lineItems,
        paymentType: PAYMENT_TYPES.BANK_TRANSFER,
        remarks: `Marcus Properties — ${monthLabel} statement`,
        lang: 'he',
      })

      // Mark work logs as invoiced
      if (workLogs && workLogs.length > 0) {
        await serviceClient
          .from('work_logs')
          .update({ invoiced: true, invoice_id: doc.id })
          .in('id', workLogs.map(w => w.id))
      }

      return NextResponse.json({
        success: true,
        invoice_id: doc.id,
        invoice_number: doc.number,
        total_agorot: totalAgorot,
        line_items: lineItems.length,
      })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to create invoice' },
        { status: 500 }
      )
    }
  }

  // Return preview (no invoice created yet)
  return NextResponse.json({
    preview: true,
    owner: owner.full_name,
    month: monthLabel,
    line_items: lineItems.map(item => ({
      description: item.description,
      amount: item.priceAgorot / 100,
    })),
    total: totalAgorot / 100,
    bills_count: (bills ?? []).length,
    hours_count: (workLogs ?? []).length,
  })
}
