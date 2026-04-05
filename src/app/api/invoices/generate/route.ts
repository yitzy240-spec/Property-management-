import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createCommissionInvoice } from '@/lib/green-invoice'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/invoices/generate
 * Generate Green Invoice commission invoices for unpushed fee entries.
 *
 * Groups unpushed fees by owner, creates one invoice per owner,
 * marks fee entries as pushed.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { billing_month } = await request.json()
  if (!billing_month) {
    return NextResponse.json({ error: 'billing_month required (e.g., 2026-04-01)' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Get unpushed fee entries for this month with property + owner info
  const { data: feeEntries } = await serviceClient
    .from('fee_entries')
    .select('*, properties(name, owner_id, owners(full_name, email))')
    .eq('billing_month', billing_month)
    .eq('pushed_to_invoice', false)

  if (!feeEntries || feeEntries.length === 0) {
    return NextResponse.json({ message: 'No unpushed fee entries', invoices: 0 })
  }

  // Group by owner
  const ownerGroups = new Map<string, {
    ownerName: string
    ownerEmail: string
    entries: typeof feeEntries
  }>()

  for (const entry of feeEntries) {
    const property = entry.properties as { name: string; owner_id: string; owners: { full_name: string; email: string } | null } | null
    if (!property?.owners) continue

    const ownerId = property.owner_id
    if (!ownerGroups.has(ownerId)) {
      ownerGroups.set(ownerId, {
        ownerName: property.owners.full_name,
        ownerEmail: property.owners.email,
        entries: [],
      })
    }
    ownerGroups.get(ownerId)!.entries.push(entry)
  }

  const results: { owner: string; invoiceId?: string; error?: string }[] = []

  for (const [ownerId, group] of ownerGroups) {
    // Aggregate fees by type across all properties for this owner
    let totalCommission = 0
    let totalHourly = 0
    let totalFixed = 0
    const propertyNames: string[] = []

    for (const entry of group.entries) {
      const propName = (entry.properties as { name: string })?.name || 'Unknown'
      if (!propertyNames.includes(propName)) propertyNames.push(propName)

      if (entry.fee_type === 'commission') totalCommission += entry.amount_agorot
      else if (entry.fee_type === 'hourly') totalHourly += entry.amount_agorot
      else if (entry.fee_type === 'fixed') totalFixed += entry.amount_agorot
    }

    const monthLabel = new Date(billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    try {
      const invoice = await createCommissionInvoice({
        ownerName: group.ownerName,
        ownerEmail: group.ownerEmail,
        propertyName: propertyNames.join(', '),
        billingMonth: monthLabel,
        commissionAgorot: totalCommission,
        hourlyAgorot: totalHourly,
        fixedFeeAgorot: totalFixed,
        lang: 'he',
      })

      // Mark all entries as pushed
      const entryIds = group.entries.map(e => e.id)
      await serviceClient
        .from('fee_entries')
        .update({ pushed_to_invoice: true, invoice_id: invoice.id })
        .in('id', entryIds)

      results.push({ owner: group.ownerName, invoiceId: invoice.id })
    } catch (err) {
      results.push({ owner: group.ownerName, error: err instanceof Error ? err.message : 'Unknown' })
    }
  }

  const successCount = results.filter(r => r.invoiceId).length
  return NextResponse.json({
    message: `Generated ${successCount}/${results.length} invoices`,
    invoices: successCount,
    results,
  })
}
