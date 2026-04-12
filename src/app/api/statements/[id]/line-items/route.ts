import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * PUT /api/statements/[id]/line-items
 * Replace all line items for a statement (admin edit).
 * Also recalculates net_amount and direction.
 *
 * Body: { line_items: StatementLineItemData[] }
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { line_items } = await request.json()
  if (!Array.isArray(line_items)) {
    return NextResponse.json({ error: 'line_items array required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  const { data: statement, error } = await serviceClient
    .from('monthly_statements')
    .select('id, status')
    .eq('id', params.id)
    .single()

  if (error || !statement) {
    return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  }

  if (statement.status === 'sent' || statement.status === 'paid') {
    return NextResponse.json({ error: `Cannot edit statement in "${statement.status}" status` }, { status: 400 })
  }

  // Recalculate totals from line items
  let grossRental = 0
  let commission = 0
  let hourly = 0
  let fixedFee = 0
  let bills = 0

  for (const item of line_items) {
    const amt = item.amount_agorot ?? 0
    switch (item.category) {
      case 'rental_direct':
        grossRental += Math.abs(amt)
        break
      case 'commission_direct':
      case 'commission_platform':
        commission += amt
        break
      case 'hourly':
        hourly += amt
        break
      case 'fixed_fee':
        fixedFee += amt
        break
      case 'bill_expense':
        bills += amt
        break
      case 'custom':
        // Custom items: positive = charge, negative = credit
        if (amt < 0) grossRental += Math.abs(amt) // treat as credit
        else bills += amt // treat as incidental charge
        break
    }
  }

  const charges = commission + hourly + fixedFee + bills
  const net = charges - grossRental
  const direction = net > 0 ? 'owner_owes' : net < 0 ? 'marcus_owes' : 'zero'

  // Update statement
  await serviceClient
    .from('monthly_statements')
    .update({
      line_items,
      gross_rental_agorot: grossRental,
      commission_agorot: commission,
      hourly_charges_agorot: hourly,
      fixed_fee_agorot: fixedFee,
      bills_paid_agorot: bills,
      net_amount_agorot: net,
      direction,
      status: 'pending_approval', // Editing resets to pending
    })
    .eq('id', params.id)

  // Replace audit trail line items
  await serviceClient
    .from('statement_line_items')
    .delete()
    .eq('statement_id', params.id)

  if (line_items.length > 0) {
    await serviceClient.from('statement_line_items').insert(
      line_items.map((li: Record<string, unknown>) => ({
        statement_id: params.id,
        property_id: li.property_id || null,
        section: li.section || 'fees',
        category: li.category,
        description: li.description,
        amount_agorot: li.amount_agorot,
        source_id: li.source_id || null,
        source_type: li.source_type || null,
        is_manual: li.is_manual || false,
      }))
    )
  }

  return NextResponse.json({
    message: 'Statement updated',
    net_amount_agorot: net,
    direction,
  })
}

/**
 * POST /api/statements/[id]/line-items
 * Add a single custom line item (e.g. cash adjustment, manual charge).
 *
 * Body: { property_id, section, category, description, amount_agorot }
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { property_id, property_name, section, description, amount_agorot } = body

  if (!description || amount_agorot === undefined) {
    return NextResponse.json({ error: 'description and amount_agorot required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  const { data: statement, error } = await serviceClient
    .from('monthly_statements')
    .select('id, status, line_items, net_amount_agorot, gross_rental_agorot, commission_agorot, hourly_charges_agorot, fixed_fee_agorot, bills_paid_agorot')
    .eq('id', params.id)
    .single()

  if (error || !statement) {
    return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  }

  if (statement.status === 'sent' || statement.status === 'paid') {
    return NextResponse.json({ error: `Cannot edit statement in "${statement.status}" status` }, { status: 400 })
  }

  const newItem = {
    property_id: property_id || null,
    property_name: property_name || 'General',
    section: section || 'incidentals',
    category: 'custom' as const,
    description,
    amount_agorot,
    is_manual: true,
  }

  const updatedItems = [...(statement.line_items as unknown[]), newItem]

  // Full recalculation from all items (including the new one)
  const allItems = updatedItems as Array<{ amount_agorot: number; category: string }>
  let grossRental = 0
  let commissionTotal = 0
  let hourlyTotal = 0
  let fixedTotal = 0
  let billsTotal = 0

  for (const item of allItems) {
    const amt = item.amount_agorot ?? 0
    switch (item.category) {
      case 'rental_direct': grossRental += Math.abs(amt); break
      case 'commission_direct': case 'commission_platform': commissionTotal += amt; break
      case 'hourly': hourlyTotal += amt; break
      case 'fixed_fee': fixedTotal += amt; break
      case 'bill_expense': billsTotal += amt; break
      case 'custom': if (amt < 0) grossRental += Math.abs(amt); else billsTotal += amt; break
    }
  }

  const charges = commissionTotal + hourlyTotal + fixedTotal + billsTotal
  const newNet = charges - grossRental
  const direction = newNet > 0 ? 'owner_owes' : newNet < 0 ? 'marcus_owes' : 'zero'

  await serviceClient
    .from('monthly_statements')
    .update({
      line_items: updatedItems,
      gross_rental_agorot: grossRental,
      commission_agorot: commissionTotal,
      hourly_charges_agorot: hourlyTotal,
      fixed_fee_agorot: fixedTotal,
      bills_paid_agorot: billsTotal,
      net_amount_agorot: newNet,
      direction,
      status: 'pending_approval',
    })
    .eq('id', params.id)

  // Add to audit trail
  await serviceClient.from('statement_line_items').insert({
    statement_id: params.id,
    property_id: property_id || null,
    section: section || 'incidentals',
    category: 'custom',
    description,
    amount_agorot,
    is_manual: true,
  })

  return NextResponse.json({ message: 'Line item added', net_amount_agorot: newNet, direction })
}
