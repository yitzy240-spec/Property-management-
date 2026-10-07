import { z } from 'zod'
import { AgentError, json, readJson, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { loadOwner } from '@/lib/agent-api/owners'

export const dynamic = 'force-dynamic'

type Params = { id: string }

const OwnerPatch = z
  .object({
    full_name: z.string().min(1).max(200),
    email: z.string().email(),
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
 * PATCH /api/agent/v1/owners/:id — name, contact, tier, notes.
 * Note: the owner signs in with their login email; changing `email` here
 * changes where notifications go, not their login.
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
