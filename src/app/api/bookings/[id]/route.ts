import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

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

  const { error } = await serviceClient
    .from('bookings')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
