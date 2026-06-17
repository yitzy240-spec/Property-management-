'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { resolveCanvaDesignUrl } from '@/lib/canva'

export async function createProperty(data: Record<string, unknown>) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  if ('canva_design_url' in data) {
    data.canva_design_url = await resolveCanvaDesignUrl(data.canva_design_url as string | null)
  }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.from('properties').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/properties')
  revalidatePath('/codes')
  return { success: true }
}

export async function updateProperty(id: string, data: Record<string, unknown>) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  if ('canva_design_url' in data) {
    data.canva_design_url = await resolveCanvaDesignUrl(data.canva_design_url as string | null)
  }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.from('properties').update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/properties')
  revalidatePath(`/properties/${id}`)
  revalidatePath('/codes')
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

export interface BillEdits {
  amount_agorot?: number
  due_date?: string | null
  bill_type?: string
  property_id?: string
  period_start?: string | null
  period_end?: string | null
}

export async function updateBillStatus(
  billId: string,
  status: 'approved' | 'rejected',
  paymentMethod?: string,
  edits?: BillEdits
) {
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

  const updateData: Record<string, unknown> = {
    status,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
    approved_by: status === 'approved' ? user.id : null,
  }
  if (paymentMethod) updateData.payment_method = paymentMethod

  // Merge optional edits into the same UPDATE so {edits + status} commit
  // atomically. We map the form's `period_start` / `period_end` to the DB
  // columns `billing_period_start` / `billing_period_end`.
  if (edits) {
    if (edits.amount_agorot !== undefined) updateData.amount_agorot = edits.amount_agorot
    if (edits.due_date !== undefined) updateData.due_date = edits.due_date
    if (edits.bill_type !== undefined) updateData.bill_type = edits.bill_type
    if (edits.property_id !== undefined) updateData.property_id = edits.property_id
    if (edits.period_start !== undefined) updateData.billing_period_start = edits.period_start
    if (edits.period_end !== undefined) updateData.billing_period_end = edits.period_end
  }

  const { error } = await serviceClient
    .from('bills')
    .update(updateData)
    .eq('id', billId)

  if (error) return { error: error.message }

  // For schedule-prediction below, prefer any newly-edited property_id / bill_type.
  const effectivePropertyId = (edits?.property_id ?? bill?.property_id) as string | undefined
  const effectiveBillType = (edits?.bill_type ?? bill?.bill_type) as string | undefined

  // On approval: update bill schedule prediction for this property + bill type
  if (status === 'approved' && effectivePropertyId && effectiveBillType) {
    const receivedDate = new Date(bill?.created_at ?? new Date().toISOString())
    const dayOfMonth = receivedDate.getDate()

    // Check if we have a previous bill to determine cycle
    const { data: prevBills } = await serviceClient
      .from('bills')
      .select('created_at')
      .eq('property_id', effectivePropertyId)
      .eq('bill_type', effectiveBillType)
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
        property_id: effectivePropertyId,
        bill_type: effectiveBillType,
        expected_day_of_month: dayOfMonth,
        cycle_months: cycleMonths,
        last_received_at: receivedDate.toISOString().split('T')[0],
        next_expected_at: nextExpected.toISOString().split('T')[0],
      }, { onConflict: 'property_id,bill_type' })
  }

  // Pages that surface the pending-bills count cache between client navigations,
  // so updating a bill must invalidate them or the dashboard banner stays stale.
  revalidatePath('/dashboard')
  revalidatePath('/bills')
  if (effectivePropertyId) revalidatePath(`/properties/${effectivePropertyId}`)

  return { success: true }
}
