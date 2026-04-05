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
  const { error } = await serviceClient
    .from('bills')
    .update({
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      approved_by: user.id,
    })
    .eq('id', billId)

  if (error) return { error: error.message }
  return { success: true }
}
