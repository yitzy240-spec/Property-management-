import { toMajor } from './core'

/** Never includes entry codes or WiFi — those are behind the codes:read scope. */
export const PROPERTY_COLUMNS =
  'id, name, address, city, neighborhood, owner_id, num_bedrooms, num_beds, is_active, lodgify_property_id, ' +
  'commission_rate, management_fee_agorot, hourly_rate_agorot, maintenance_notes, owners(full_name)'

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
