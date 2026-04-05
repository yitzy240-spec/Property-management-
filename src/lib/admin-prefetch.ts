import { createServiceClient } from '@/lib/supabase/server'

/** Prefetch all admin data in one parallel batch */
export async function prefetchAdminData() {
  const supabase = createServiceClient()

  const [
    { data: properties },
    { data: owners },
    { data: bookings },
    { data: bills },
    { data: tasks },
    { data: contractors },
    { data: inventory },
    { data: documents },
    { data: revenueTracking },
    { data: seasonalTemplates },
  ] = await Promise.all([
    supabase.from('properties').select('*, owners(full_name, email, profile)').eq('is_active', true).order('name'),
    supabase.from('owners').select('*, properties(id, name)').order('full_name'),
    supabase.from('bookings').select('*, properties(name)').order('check_in', { ascending: false }).limit(100),
    supabase.from('bills').select('*, properties(name)').order('created_at', { ascending: false }).limit(100),
    supabase.from('tasks').select('*, properties(name), contractors(name)').order('created_at', { ascending: false }).limit(100),
    supabase.from('contractors').select('*').eq('is_active', true).order('name'),
    supabase.from('inventory_items').select('*, properties(name)').order('item_name'),
    supabase.from('documents').select('*, properties(name), owners(full_name)').order('created_at', { ascending: false }),
    supabase.from('revenue_tracking').select('*').eq('year', new Date().getFullYear()),
    supabase.from('seasonal_templates').select('*').order('month_trigger'),
  ])

  return {
    properties: properties ?? [],
    owners: owners ?? [],
    bookings: bookings ?? [],
    bills: bills ?? [],
    tasks: tasks ?? [],
    contractors: contractors ?? [],
    inventory: inventory ?? [],
    documents: documents ?? [],
    revenueTracking: revenueTracking ?? [],
    seasonalTemplates: seasonalTemplates ?? [],
  }
}
