/**
 * Monthly Statement Calculator
 *
 * Generates one statement per owner, grouped by property, with three sections:
 *
 * BOOKINGS:
 * - Direct bookings: full rental amount shown (Marcus collected the rent)
 * - Platform bookings (airbnb, booking_com): commission fee only
 *   (platform paid owner directly, Marcus invoices commission)
 * - Owner stays: skipped entirely
 *
 * FEES:
 * - Management commission on direct bookings
 * - Fixed monthly management fee per property
 * - Hourly work charges
 *
 * INCIDENTALS:
 * - Bills paid by admin on owner's behalf
 *
 * Net: positive = owner owes Marcus, negative = Marcus owes owner
 *
 * All statements start as 'draft' for admin review/edit before sending.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { StatementLineItemData, StatementDirection, LineItemSection, LineItemCategory } from '@/types'

const CC_SURCHARGE_RATE = 0.035

interface OwnerStatementCalc {
  ownerId: string
  ownerName: string
  ownerEmail: string
  greenInvoiceClientId: string | null
  billingMonth: string
  direction: StatementDirection
  grossRentalAgorot: number
  commissionAgorot: number
  hourlyChargesAgorot: number
  fixedFeeAgorot: number
  billsPaidAgorot: number
  netAmountAgorot: number
  lineItems: StatementLineItemData[]
}

function monthRange(billingMonth: string): { start: string; end: string } {
  const d = new Date(billingMonth + 'T00:00:00Z')
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function li(
  prop: { id: string; name: string },
  section: LineItemSection,
  category: LineItemCategory,
  description: string,
  amount_agorot: number,
  source_id?: string,
  source_type?: string,
): StatementLineItemData {
  return {
    property_id: prop.id,
    property_name: prop.name,
    section,
    category,
    description,
    amount_agorot,
    source_id,
    source_type,
  }
}

export async function calculateMonthlyStatements(
  supabase: SupabaseClient,
  billingMonth: string
): Promise<OwnerStatementCalc[]> {
  const { start, end } = monthRange(billingMonth)

  const { data: owners, error: ownersErr } = await supabase
    .from('owners')
    .select('id, full_name, email, green_invoice_client_id')

  if (ownersErr) throw new Error(`Failed to fetch owners: ${ownersErr.message}`)
  if (!owners?.length) return []

  const { data: properties, error: propsErr } = await supabase
    .from('properties')
    .select('id, owner_id, name, commission_rate, management_fee_agorot, hourly_rate_agorot')
    .eq('is_active', true)

  if (propsErr) throw new Error(`Failed to fetch properties: ${propsErr.message}`)

  const { data: bookings, error: bookErr } = await supabase
    .from('bookings')
    .select('id, property_id, platform, gross_rental_agorot, guest_name, check_in, check_out')
    .gte('check_out', start)
    .lte('check_out', end)

  if (bookErr) throw new Error(`Failed to fetch bookings: ${bookErr.message}`)

  const { data: workLogs, error: wlErr } = await supabase
    .from('work_logs')
    .select('id, property_id, hours, description, date')
    .gte('date', start)
    .lte('date', end)
    .eq('billable', true)

  if (wlErr) throw new Error(`Failed to fetch work logs: ${wlErr.message}`)

  const { data: bills, error: billErr } = await supabase
    .from('bills')
    .select('id, property_id, bill_type, amount_agorot, due_date')
    .eq('status', 'approved')
    .eq('payment_method', 'paid_by_admin')
    .gte('approved_at', start + 'T00:00:00Z')
    .lte('approved_at', end + 'T23:59:59Z')

  if (billErr) throw new Error(`Failed to fetch bills: ${billErr.message}`)

  const results: OwnerStatementCalc[] = []

  for (const owner of owners) {
    const ownerProps = (properties ?? []).filter(p => p.owner_id === owner.id)
    if (ownerProps.length === 0) continue

    const lineItems: StatementLineItemData[] = []
    let totalRental = 0
    let totalCommission = 0
    let totalHourly = 0
    let totalFixed = 0
    let totalBills = 0

    for (const prop of ownerProps) {
      const p = { id: prop.id, name: prop.name }
      const rate = prop.commission_rate ?? 0.20
      const rateLabel = `${(rate * 100).toFixed(0)}%`

      // ── BOOKINGS SECTION ──
      const propBookings = (bookings ?? []).filter(b => b.property_id === prop.id)
      for (const booking of propBookings) {
        const rental = booking.gross_rental_agorot ?? 0
        const platform = booking.platform || 'direct'

        if (platform === 'owner_stay') continue
        if (rental <= 0) continue

        const guestLabel = booking.guest_name || 'Guest'
        const dateRange = `${booking.check_in} – ${booking.check_out}`

        if (platform === 'airbnb') {
          // Airbnb: pays owner their share AND pays Marcus commission directly.
          // Zero financial impact on the statement — just informational.
          lineItems.push(li(p, 'bookings', 'commission_platform',
            `${guestLabel} via Airbnb (₪${(rental / 100).toLocaleString()}) — commission paid by Airbnb`,
            0, booking.id, 'booking'))
        } else if (platform === 'direct') {
          // Direct: Marcus collected the rent, deducts commission
          totalRental += rental
          lineItems.push(li(p, 'bookings', 'rental_direct',
            `${guestLabel} (${dateRange})`,
            -rental, booking.id, 'booking'))

          const commission = Math.round(rental * rate)
          if (commission > 0) {
            totalCommission += commission
            lineItems.push(li(p, 'fees', 'commission_direct',
              `Commission ${rateLabel} on ${guestLabel}`,
              commission, booking.id, 'booking'))
          }
        } else {
          // Other platforms (booking_com, etc): pay owner directly, Marcus invoices commission
          const commission = Math.round(rental * rate)
          if (commission > 0) {
            totalCommission += commission
            lineItems.push(li(p, 'bookings', 'commission_platform',
              `${guestLabel} via ${platform} — ${rateLabel} commission (on ₪${(rental / 100).toLocaleString()})`,
              commission, booking.id, 'booking'))
          }
        }
      }

      // ── FEES SECTION ──
      // Fixed monthly fee
      const fixedFee = prop.management_fee_agorot ?? 0
      if (fixedFee > 0) {
        totalFixed += fixedFee
        lineItems.push(li(p, 'fees', 'fixed_fee',
          'Monthly management fee',
          fixedFee, prop.id, 'property'))
      }

      // Hourly work
      const propWorkLogs = (workLogs ?? []).filter(w => w.property_id === prop.id)
      for (const wl of propWorkLogs) {
        const hourlyAmount = Math.round((wl.hours ?? 0) * (prop.hourly_rate_agorot ?? 0))
        if (hourlyAmount > 0) {
          totalHourly += hourlyAmount
          lineItems.push(li(p, 'fees', 'hourly',
            `${wl.description} (${wl.hours}h @ ₪${(prop.hourly_rate_agorot / 100).toFixed(0)}/hr)`,
            hourlyAmount, wl.id, 'work_log'))
        }
      }

      // ── INCIDENTALS SECTION ──
      const propBills = (bills ?? []).filter(b => b.property_id === prop.id)
      for (const bill of propBills) {
        totalBills += bill.amount_agorot
        lineItems.push(li(p, 'incidentals', 'bill_expense',
          `${bill.bill_type.replace('_', ' ')} bill${bill.due_date ? ` (due ${bill.due_date})` : ''}`,
          bill.amount_agorot, bill.id, 'bill'))
      }
    }

    // Net: charges - direct rental income
    const charges = totalCommission + totalHourly + totalFixed + totalBills
    const net = charges - totalRental

    if (totalRental === 0 && charges === 0) continue

    const direction: StatementDirection =
      net > 0 ? 'owner_owes' : net < 0 ? 'marcus_owes' : 'zero'

    results.push({
      ownerId: owner.id,
      ownerName: owner.full_name,
      ownerEmail: owner.email,
      greenInvoiceClientId: owner.green_invoice_client_id,
      billingMonth,
      direction,
      grossRentalAgorot: totalRental,
      commissionAgorot: totalCommission,
      hourlyChargesAgorot: totalHourly,
      fixedFeeAgorot: totalFixed,
      billsPaidAgorot: totalBills,
      netAmountAgorot: net,
      lineItems,
    })
  }

  return results
}

export function calculateCcSurcharge(amountAgorot: number): number {
  return Math.round(Math.abs(amountAgorot) * CC_SURCHARGE_RATE)
}

export { CC_SURCHARGE_RATE }
