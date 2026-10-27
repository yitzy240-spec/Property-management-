import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * PATCH /api/bookings/:id  (admin only)
 * Body: { deposit_amount_agorot: number | null } — the deposit held for the stay.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const deposit = body?.deposit_amount_agorot
  if (deposit !== null && !(Number.isInteger(deposit) && deposit >= 0)) {
    return NextResponse.json({ error: 'deposit_amount_agorot must be a non-negative integer or null' }, { status: 400 })
  }

  const { error } = await createServiceClient()
    .from('bookings')
    .update({ deposit_amount_agorot: deposit })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/bookings/:id  (admin only)
 *
 * Deletes a booking record. Used to clean up test stays / owner_stay
 * entries that were created in error. Bookings synced from external
 * iCal feeds (Airbnb/Booking) should not normally be deleted here —
 * the next sync would re-create them. Owner_stay bookings (created
 * via /api/owner/request-stay) ARE safe to delete since they have no
 * external source.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  // Its not-yet-started turnover cleans go with it (the FK would otherwise
  // just unlink them and leave them on the calendar).
  await serviceClient.from('tasks').delete().eq('booking_id', params.id).eq('is_cleaning', true).eq('status', 'pending')
  const { error } = await serviceClient
    .from('bookings')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
