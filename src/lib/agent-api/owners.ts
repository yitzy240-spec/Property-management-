import { AgentError, type ServiceClient } from './core'

export const OWNER_COLUMNS = 'id, full_name, email, phone, profile, notes, created_at, updated_at, properties(id, name, is_active)'

export async function loadOwner(db: ServiceClient, id: string) {
  const { data, error } = await db.from('owners').select(OWNER_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Owner not found.')
  return data
}
