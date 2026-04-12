/**
 * Shared statement insertion logic.
 * Used by both the manual generate endpoint and the monthly cron job.
 */

import { SupabaseClient } from '@supabase/supabase-js'

interface StatementCalc {
  ownerId: string
  ownerName: string
  billingMonth: string
  direction: string
  grossRentalAgorot: number
  commissionAgorot: number
  hourlyChargesAgorot: number
  fixedFeeAgorot: number
  billsPaidAgorot: number
  netAmountAgorot: number
  lineItems: Array<{
    property_id: string
    property_name: string
    section: string
    category: string
    description: string
    amount_agorot: number
    source_id?: string
    source_type?: string
  }>
}

export async function insertStatements(
  serviceClient: SupabaseClient,
  calculations: StatementCalc[]
): Promise<{ id: string; owner: string; direction: string; net: number }[]> {
  const results = []

  for (const calc of calculations) {
    const { data: statement, error } = await serviceClient
      .from('monthly_statements')
      .insert({
        owner_id: calc.ownerId,
        billing_month: calc.billingMonth,
        status: 'draft',
        direction: calc.direction,
        gross_rental_agorot: calc.grossRentalAgorot,
        commission_agorot: calc.commissionAgorot,
        hourly_charges_agorot: calc.hourlyChargesAgorot,
        fixed_fee_agorot: calc.fixedFeeAgorot,
        bills_paid_agorot: calc.billsPaidAgorot,
        net_amount_agorot: calc.netAmountAgorot,
        line_items: calc.lineItems,
      })
      .select()
      .single()

    if (error) {
      console.error(`[Statements] Failed for owner ${calc.ownerId}:`, error)
      continue
    }

    if (statement && calc.lineItems.length > 0) {
      await serviceClient.from('statement_line_items').insert(
        calc.lineItems.map(li => ({
          statement_id: statement.id,
          property_id: li.property_id,
          section: li.section || 'fees',
          category: li.category,
          description: li.description,
          amount_agorot: li.amount_agorot,
          source_id: li.source_id || null,
          source_type: li.source_type || null,
        }))
      )
    }

    results.push({
      id: statement.id,
      owner: calc.ownerName,
      direction: calc.direction,
      net: calc.netAmountAgorot,
    })
  }

  return results
}
