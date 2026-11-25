import { z } from 'zod'
import { AgentError, toMajor, toMinor, type ServiceClient } from './core'

/** Never includes entry codes or WiFi — those are behind the codes:read scope. */
export const PROPERTY_COLUMNS =
  'id, name, address, city, neighborhood, owner_id, num_bedrooms, num_beds, is_active, lodgify_property_id, ' +
  'commission_rate, management_fee_agorot, hourly_rate_agorot, maintenance_notes, owners(full_name)'

/** Fields allowed by the web UI property edit form */
export const PropertyPatch = z
  .object({
    name: z.string().min(1).max(200),
    address: z.string().min(1).max(500),
    city: z.string().min(1).max(100),
    neighborhood: z.string().max(100).nullable(),
    num_bedrooms: z.number().int().positive(),
    num_beds: z.number().int().positive(),
    entry_code: z.string().max(50).nullable(),
    building_entry_code: z.string().max(50).nullable(),
    youtube_tutorial_url: z.string().url().nullable(),
    canva_design_url: z.string().url().nullable(),
    entry_instructions: z.string().max(2000).nullable(),
    wifi_name: z.string().max(100).nullable(),
    wifi_password: z.string().max(100).nullable(),
    owner_id: z.string().uuid(),
    commission_rate: z.number().min(0).max(1),
    management_fee_ils: z.number().min(0),
    hourly_rate_ils: z.number().min(0),
    lodgify_property_id: z.string().max(50).nullable(),
  })
  .partial()
  .strict()

export function serializeProperty(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    city: p.city,
    neighborhood: p.neighborhood ?? null,
    owner_id: p.owner_id,
    owner_name: (p.owners as { full_name?: string } | null)?.full_name ?? null,
    bedrooms: p.num_bedrooms,
    beds: p.num_beds,
    is_active: p.is_active,
    lodgify_property_id: p.lodgify_property_id ?? null,
    commission_rate: p.commission_rate,
    management_fee_ils: toMajor(p.management_fee_agorot as number | null),
    hourly_rate_ils: toMajor(p.hourly_rate_agorot as number | null),
    maintenance_notes: p.maintenance_notes ?? null,
  }
}

export async function loadProperty(db: ServiceClient, id: string) {
  const { data, error } = await db.from('properties').select(PROPERTY_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Property not found.')
  return serializeProperty(data as unknown as Record<string, unknown>)
}
