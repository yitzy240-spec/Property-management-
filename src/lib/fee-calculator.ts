import { createServiceClient } from '@/lib/supabase/server'

interface FeeBreakdown {
  property_id: string
  property_name: string
  commission_agorot: number
  hourly_agorot: number
  fixed_agorot: number
  total_agorot: number
  bookings_used: { id: string; guest_name: string | null; gross: number; fees: number; net: number }[]
  tasks_used: { id: string; title: string; hours: number; rate: number }[]
}

/**
 * Calculate fees for a property for a given billing month.
 *
 * Commission: commission_rate × (gross_rental - channel_fees) for bookings that checked out this month
 * Hourly: sum of (billable_hours × hourly_rate) for completed tasks this month
 * Fixed: flat management_fee_agorot per month
 */
export async function calculatePropertyFees(
  propertyId: string,
  billingMonth: string // 'YYYY-MM-01'
): Promise<FeeBreakdown> {
  const serviceClient = createServiceClient()

  // Get property details
  const { data: property } = await serviceClient
    .from('properties')
    .select('id, name, commission_rate, hourly_rate_agorot, management_fee_agorot')
    .eq('id', propertyId)
    .single()

  if (!property) throw new Error('Property not found')

  // Parse month range
  const monthStart = new Date(billingMonth)
  const monthEnd = new Date(monthStart)
  monthEnd.setMonth(monthEnd.getMonth() + 1)

  const startStr = monthStart.toISOString().split('T')[0]
  const endStr = monthEnd.toISOString().split('T')[0]

  // Get bookings that checked out this month (commission basis).
  // Skip cancelled bookings — commission only applies to actual stays.
  const { data: bookings } = await serviceClient
    .from('bookings')
    .select('id, guest_name, gross_rental_agorot, channel_fees_agorot')
    .eq('property_id', propertyId)
    .eq('is_cancelled', false)
    .gte('check_out', startStr)
    .lt('check_out', endStr)

  // Calculate commission
  let commissionAgorot = 0
  const bookingsUsed = (bookings ?? []).map((b) => {
    const gross = b.gross_rental_agorot ?? 0
    const fees = b.channel_fees_agorot ?? 0
    const net = gross - fees
    const commission = Math.round(net * property.commission_rate)
    commissionAgorot += commission
    return { id: b.id, guest_name: b.guest_name, gross, fees, net }
  })

  // Get completed tasks this month (hourly basis)
  const { data: tasks } = await serviceClient
    .from('tasks')
    .select('id, title, billable_hours')
    .eq('property_id', propertyId)
    .eq('status', 'completed')
    .gt('billable_hours', 0)
    .gte('completed_at', monthStart.toISOString())
    .lt('completed_at', monthEnd.toISOString())

  let hourlyAgorot = 0
  const tasksUsed = (tasks ?? []).map((t) => {
    const hours = Number(t.billable_hours) || 0
    const amount = Math.round(hours * property.hourly_rate_agorot)
    hourlyAgorot += amount
    return { id: t.id, title: t.title, hours, rate: property.hourly_rate_agorot }
  })

  const fixedAgorot = property.management_fee_agorot

  return {
    property_id: propertyId,
    property_name: property.name,
    commission_agorot: commissionAgorot,
    hourly_agorot: hourlyAgorot,
    fixed_agorot: fixedAgorot,
    total_agorot: commissionAgorot + hourlyAgorot + fixedAgorot,
    bookings_used: bookingsUsed,
    tasks_used: tasksUsed,
  }
}
