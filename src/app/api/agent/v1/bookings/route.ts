import { createBooking } from '@/lib/bookings'
import { AgentError, json, refreshAdminPages, paging, readJson, toMinor, withAgent } from '@/lib/agent-api/core'
import { BOOKING_COLUMNS, BookingCreate, amountsPaid, loadBooking, serializeBooking } from '@/lib/agent-api/bookings'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agent/v1/bookings
 *   ?property_id= &from=YYYY-MM-DD &to=YYYY-MM-DD (stays overlapping the range)
 *   &updated_since=ISO &platform= &guest= (name contains) &include_cancelled=true
 *   &limit= (≤500, default 100) &offset=
 */
export const GET = withAgent('bookings:read', async (request, { db }) => {
  const url = new URL(request.url)
  const p = url.searchParams
  const { limit, offset } = paging(url)

  let q = db.from('bookings').select(BOOKING_COLUMNS).order('check_in', { ascending: true }).range(offset, offset + limit - 1)
  if (p.get('property_id')) q = q.eq('property_id', p.get('property_id')!)
  if (p.get('from')) q = q.gte('check_out', p.get('from')!)
  if (p.get('to')) q = q.lte('check_in', p.get('to')!)
  if (p.get('updated_since')) q = q.gte('updated_at', p.get('updated_since')!)
  if (p.get('platform')) q = q.eq('platform', p.get('platform')!)
  if (p.get('guest')) q = q.ilike('guest_name', `%${p.get('guest')!.replace(/[%_]/g, '')}%`)
  if (p.get('include_cancelled') !== 'true') q = q.eq('is_cancelled', false)

  const { data, error } = await q
  if (error) throw new AgentError(500, error.message)
  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>
  const paid = await amountsPaid(db, rows.map(r => r.id))
  return json({ bookings: rows.map(r => serializeBooking(r, paid.get(r.id))), limit, offset })
})

/**
 * POST /api/agent/v1/bookings — create a booking (or an owner stay with
 * platform "owner_stay"). Pushed to Lodgify when the property is linked, same
 * as the admin form. Amounts are in major units of `currency` (no conversion).
 */
export const POST = withAgent('bookings:write', async (request, { db, audit }) => {
  const body = BookingCreate.parse(await readJson(request))
  const result = await createBooking(db, {
    property_id: body.property_id,
    check_in: body.check_in,
    check_out: body.check_out,
    guest_name: body.guest_name,
    guest_email: body.guest_email,
    guest_phone: body.guest_phone,
    platform: body.platform,
    gross_rental_agorot: toMinor(body.amount),
    channel_fees_agorot: toMinor(body.channel_fees),
    deposit_amount_agorot: toMinor(body.deposit),
    currency: body.currency,
    exchange_rate: body.currency === 'ILS' ? null : body.exchange_rate,
    payment_status: body.payment_status,
    notes: body.notes,
  })
  if ('error' in result) throw new AgentError(400, result.error)

  const booking = serializeBooking(await loadBooking(db, result.id))
  await audit({ resource: 'booking', resourceId: result.id, action: 'create', after: booking })
  refreshAdminPages(`/properties/${body.property_id}`, '/financials')
  return json({ booking, lodgify: result.lodgify }, 201)
})
