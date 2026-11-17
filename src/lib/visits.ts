import { SupabaseClient } from '@supabase/supabase-js'
import type { ChecklistKey } from '@/types'

interface PropertyVisitStatus {
  id: string
  name: string
  neighborhood: string | null
  city: string
  owner_id: string
  last_visit_date: string | null
  last_admin_note: string | null
  next_visit_due: string
  is_occupied: boolean
  occupancy_end: string | null
  occupancy_type: 'guest' | 'owner_stay' | null
}

export async function getPropertyVisitStatuses(
  supabase: SupabaseClient
): Promise<PropertyVisitStatus[]> {
  const today = new Date().toISOString().split('T')[0]

  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, neighborhood, city, owner_id, created_at, exclude_from_visits')
    .eq('is_active', true)
    .order('name')

  if (!properties || properties.length === 0) return []

  // Filter out properties excluded from visits
  const activeProperties = properties.filter(p => !p.exclude_from_visits)
  const propertyIds = activeProperties.map(p => p.id)

  const { data: visits } = await supabase
    .from('visits')
    .select('property_id, visited_at, admin_note')
    .in('property_id', propertyIds)
    .order('visited_at', { ascending: false })

  const { data: bookings } = await supabase
    .from('bookings')
    .select('property_id, check_out, platform')
    .in('property_id', propertyIds)
    .eq('is_cancelled', false)
    .lte('check_in', today)
    .gt('check_out', today)

  const { data: recentCheckouts } = await supabase
    .from('bookings')
    .select('property_id, check_out')
    .in('property_id', propertyIds)
    .eq('is_cancelled', false)
    .lte('check_out', today)
    .order('check_out', { ascending: false })

  const lastVisitMap = new Map<string, { date: string; admin_note: string | null }>()
  for (const v of visits ?? []) {
    if (!lastVisitMap.has(v.property_id)) {
      lastVisitMap.set(v.property_id, { date: v.visited_at, admin_note: v.admin_note })
    }
  }

  const activeBookingMap = new Map<string, { check_out: string; type: 'guest' | 'owner_stay' }>()
  for (const b of bookings ?? []) {
    if (!activeBookingMap.has(b.property_id)) {
      const isOwnerStay = b.platform === 'owner_stay'
      activeBookingMap.set(b.property_id, {
        check_out: b.check_out,
        type: isOwnerStay ? 'owner_stay' : 'guest',
      })
    }
  }

  const lastCheckoutMap = new Map<string, string>()
  for (const b of recentCheckouts ?? []) {
    if (!lastCheckoutMap.has(b.property_id)) {
      lastCheckoutMap.set(b.property_id, b.check_out)
    }
  }

  return activeProperties.map(p => {
    const lastVisit = lastVisitMap.get(p.id)
    const activeBooking = activeBookingMap.get(p.id)
    const lastCheckout = lastCheckoutMap.get(p.id)

    const candidates = [p.created_at.split('T')[0]]
    if (lastVisit) candidates.push(lastVisit.date)
    if (lastCheckout) candidates.push(lastCheckout)

    const baseDate = candidates.sort().pop()!
    const due = new Date(baseDate)
    due.setDate(due.getDate() + 14)

    return {
      id: p.id,
      name: p.name,
      neighborhood: p.neighborhood,
      city: p.city,
      owner_id: p.owner_id,
      last_visit_date: lastVisit?.date ?? null,
      last_admin_note: lastVisit?.admin_note ?? null,
      next_visit_due: due.toISOString().split('T')[0],
      is_occupied: !!activeBooking,
      occupancy_end: activeBooking?.check_out ?? null,
      occupancy_type: activeBooking?.type ?? null,
    }
  })
}

export async function getPropertyVisits(
  supabase: SupabaseClient,
  propertyId: string,
  limit = 5
) {
  const { data } = await supabase
    .from('visits')
    .select('*')
    .eq('property_id', propertyId)
    .order('visited_at', { ascending: false })
    .limit(limit)

  return data ?? []
}

export async function getOwnerVisits(
  supabase: SupabaseClient,
  propertyIds: string[],
  limit = 10
) {
  if (propertyIds.length === 0) return []

  const { data } = await supabase
    .from('visits')
    .select('id, property_id, visited_at, checklist, note, created_at, properties(name)')
    .in('property_id', propertyIds)
    .order('visited_at', { ascending: false })
    .limit(limit)

  return data ?? []
}

/**
 * Check if a visit is within the 24-hour edit window.
 * Returns true if the visit can be edited, false otherwise.
 */
export function isWithinVisitEditWindow(createdAt: Date | string, now: Date = new Date()): boolean {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
  return hoursSinceCreation < 24
}

interface VisitMediaRow {
  id: string
  file_path: string
  file_type: 'image' | 'video'
  is_private: boolean
  signed_url?: string | null
}

interface VisitRow {
  id: string
  property_id: string
  visited_at: string
  checklist: Partial<Record<ChecklistKey, boolean>>
  note: string | null
  admin_note: string | null
  created_by: string
  created_at: string
  properties?: { name: string }
}

/**
 * Serialize visit for viewer, respecting permissions.
 * Non-admins: strips admin_note and filters out is_private media.
 */
export function serializeVisitForViewer(
  visit: VisitRow,
  media: VisitMediaRow[],
  isAdmin: boolean
) {
  // Filter media for non-admins: exclude is_private=true
  const filteredMedia = isAdmin ? media : media.filter(m => !m.is_private)

  return {
    ...visit,
    admin_note: isAdmin ? visit.admin_note : null,
    media: filteredMedia,
  }
}

interface CheckedItem {
  key: ChecklistKey
  label: string
}

export function getChecklistCheckedItems(
  checklist: Record<string, boolean> | null | undefined
): CheckedItem[] {
  if (!checklist) return []
  
  const labelMap: Record<ChecklistKey, string> = {
    electricity_working: 'Electricity working',
    run_sinks: 'Run sinks',
    run_showers: 'Run showers',
    flush_toilets: 'Flush toilets',
    refrigerator_freezer: 'Refrigerator and Freezer working',
    soap_stock: 'Soap stock',
    boiler_off: 'Boiler off',
    washer_door_open: 'Washer door open',
    dryer_lint: 'Check dryer lint',
    bedrooms_no_mold: 'Bedrooms no mold or leaking on walls',
    check_mailbox: 'Check mailbox',
  }
  
  return Object.entries(checklist)
    .filter(([_, val]) => val)
    .map(([key, _]) => ({
      key: key as ChecklistKey,
      label: labelMap[key as ChecklistKey] ?? key,
    }))
}
