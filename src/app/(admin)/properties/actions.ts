'use server'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'

export async function createProperty(data: Record<string, unknown>) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.from('properties').insert(data)
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateProperty(id: string, data: Record<string, unknown>) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.from('properties').update(data).eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function createOwner(data: Record<string, unknown>) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const serviceClient = createServiceClient()

  // Auto-provision Supabase auth user for owner portal access
  const email = data.email as string
  if (email) {
    const { data: authUser } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: 'owner' },
    })

    if (authUser?.user) {
      data.auth_user_id = authUser.user.id
    }
  }

  const { error } = await serviceClient.from('owners').insert(data)
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateOwner(id: string, data: Record<string, unknown>) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.from('owners').update(data).eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function createTask(data: Record<string, unknown>, checklistItems?: string[]) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const serviceClient = createServiceClient()
  const { data: task, error } = await serviceClient
    .from('tasks')
    .insert(data)
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (task && checklistItems && checklistItems.length > 0) {
    await serviceClient.from('task_checklist_items').insert(
      checklistItems.map((label, index) => ({
        task_id: task.id,
        label,
        sort_order: index,
      }))
    )
  }

  return { success: true }
}

export async function updateBillStatus(billId: string, status: 'approved' | 'rejected') {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const serviceClient = createServiceClient()

  // Get bill details before updating
  const { data: bill } = await serviceClient
    .from('bills')
    .select('property_id, bill_type, created_at')
    .eq('id', billId)
    .single()

  const { error } = await serviceClient
    .from('bills')
    .update({
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      approved_by: user.id,
    })
    .eq('id', billId)

  if (error) return { error: error.message }

  // On approval: update bill schedule prediction for this property + bill type
  if (status === 'approved' && bill?.property_id && bill?.bill_type) {
    const receivedDate = new Date(bill.created_at)
    const dayOfMonth = receivedDate.getDate()

    // Check if we have a previous bill to determine cycle
    const { data: prevBills } = await serviceClient
      .from('bills')
      .select('created_at')
      .eq('property_id', bill.property_id)
      .eq('bill_type', bill.bill_type)
      .eq('status', 'approved')
      .neq('id', billId)
      .order('created_at', { ascending: false })
      .limit(1)

    let cycleMonths = 1 // default monthly
    if (prevBills && prevBills.length > 0) {
      const prevDate = new Date(prevBills[0].created_at)
      const monthDiff = (receivedDate.getFullYear() - prevDate.getFullYear()) * 12 +
        (receivedDate.getMonth() - prevDate.getMonth())
      if (monthDiff >= 2) cycleMonths = monthDiff
    }

    // Calculate next expected date
    const nextExpected = new Date(receivedDate)
    nextExpected.setMonth(nextExpected.getMonth() + cycleMonths)

    await serviceClient
      .from('bill_schedules')
      .upsert({
        property_id: bill.property_id,
        bill_type: bill.bill_type,
        expected_day_of_month: dayOfMonth,
        cycle_months: cycleMonths,
        last_received_at: receivedDate.toISOString().split('T')[0],
        next_expected_at: nextExpected.toISOString().split('T')[0],
      }, { onConflict: 'property_id,bill_type' })
  }

  return { success: true }
}
