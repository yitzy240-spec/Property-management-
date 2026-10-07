import { z } from 'zod'
import { AgentError, json, readJson, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { loadOwner } from '@/lib/agent-api/owners'

export const dynamic = 'force-dynamic'

type Params = { id: string }

const OwnerPatch = z
  .object({
    full_name: z.string().min(1).max(200),
    phone: z.string().max(50).nullable(),
    profile: z.enum(['investor', 'hybrid', 'private']),
    notes: z.string().max(4000).nullable(),
  })
  .partial()
  .strict()

export const GET = withAgent<Params>('owners:read', async (_request, { db }, { id }) => {
  return json({ owner: await loadOwner(db, id) })
})

/**
 * PATCH /api/agent/v1/owners/:id — name, phone, tier, notes.
 * Email is deliberately NOT editable here: owner logins and the invite flow
 * are keyed on owners.email, so changing it could hand an owner's portal (or
 * worse, an admin account) to whoever owns the new address.
 */
export const PATCH = withAgent<Params>('owners:write', async (request, { db, audit }, { id }) => {
  const patch = OwnerPatch.parse(await readJson(request))
  if (Object.keys(patch).length === 0) throw new AgentError(400, 'No fields to update.')
  const before = structuredClone(await loadOwner(db, id))
  const { error } = await db.from('owners').update(patch).eq('id', id)
  if (error) throw new AgentError(400, error.message)
  const owner = await loadOwner(db, id)
  await audit({ resource: 'owner', resourceId: id, action: 'update', before, after: owner })
  refreshAdminPages('/owners', `/owners/${id}`)
  return json({ owner })
})
