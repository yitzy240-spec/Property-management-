import { AgentError, json, withAgent } from '@/lib/agent-api/core'

export const dynamic = 'force-dynamic'

type Params = { id: string }

/**
 * GET /api/agent/v1/properties/:id/codes — door/building codes and WiFi.
 * Separate `codes:read` scope; every read is written to the audit log.
 */
export const GET = withAgent<Params>('codes:read', async (_request, { db, audit }, { id }) => {
  const { data, error } = await db
    .from('properties')
    .select('id, name, entry_code, building_entry_code, entry_instructions, wifi_name, wifi_password, entry_code_updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Property not found.')

  await audit({ resource: 'property_codes', resourceId: id, action: 'read_codes' })
  return json({
    codes: {
      property_id: data.id,
      property_name: data.name,
      apartment_code: data.entry_code,
      building_code: data.building_entry_code,
      entry_instructions: data.entry_instructions,
      wifi_name: data.wifi_name,
      wifi_password: data.wifi_password,
      codes_updated_at: data.entry_code_updated_at,
    },
  })
})
