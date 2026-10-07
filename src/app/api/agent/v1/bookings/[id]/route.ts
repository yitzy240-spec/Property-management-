import { AgentError, json, refreshAdminPages, readJson, withAgent } from '@/lib/agent-api/core'
import {
  BookingPatch,
  amountsPaid,
  assertSyncSafe,
  bookingPatchToRow,
  loadBooking,
  serializeBooking,
} from '@/lib/agent-api/bookings'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = withAgent<Params>('bookings:read', async (_request, { db }, { id }) => {
  const row = await loadBooking(db, id)
  const paid = await amountsPaid(db, [id])
  return json({ booking: serializeBooking(row, paid.get(id)) })
})

/**
 * PATCH /api/agent/v1/bookings/:id — e.g. an extension: {"check_out":"2026-10-12"}.
 * Lodgify/iCal-synced bookings: dates, guest name, platform, amount and
 * cancellation are owned by the sync → 409 unless {"force": true}.
 */
export const PATCH = withAgent<Params>('bookings:write', async (request, { db, audit }, { id }) => {
  const patch = BookingPatch.parse(await readJson(request))
  const before = await loadBooking(db, id)
  const beforeView = serializeBooking(before)
  assertSyncSafe(before, patch, patch.force === true)

  const nextIn = patch.check_in ?? (before.check_in as string)
  const nextOut = patch.check_out ?? (before.check_out as string)
  if (nextOut <= nextIn) throw new AgentError(400, 'check_out must be after check_in.')

  const row = bookingPatchToRow(patch)
  if (Object.keys(row).length === 0) throw new AgentError(400, 'No fields to update.')
  const { error } = await db.from('bookings').update(row).eq('id', id)
  if (error) throw new AgentError(400, error.message)

  const after = await loadBooking(db, id)
  const paid = await amountsPaid(db, [id])
  const booking = serializeBooking(after, paid.get(id))
  await audit({ resource: 'booking', resourceId: id, action: 'update', before: beforeView, after: booking })
  refreshAdminPages(`/properties/${after.property_id}`, '/financials')
  return json({ booking })
})

/**
 * DELETE /api/agent/v1/bookings/:id — e.g. a duplicate. Synced bookings come
 * back on the next sync, so they need ?force=true (or cancel them at the source).
 */
export const DELETE = withAgent<Params>('bookings:write', async (request, { db, audit }, { id }) => {
  const force = new URL(request.url).searchParams.get('force') === 'true'
  const before = await loadBooking(db, id)
  assertSyncSafe(before, 'delete', force)

  const { error } = await db.from('bookings').delete().eq('id', id)
  if (error) throw new AgentError(400, error.message)
  await audit({ resource: 'booking', resourceId: id, action: 'delete', before: serializeBooking(before) })
  refreshAdminPages(`/properties/${before.property_id}`, '/financials')
  return json({ deleted: true, id })
})
