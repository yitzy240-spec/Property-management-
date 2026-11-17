import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { isWithinVisitEditWindow } from '@/lib/visits'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/visits/:id/edit
 * 
 * Edit a visit's checklist, note, and admin_note.
 * Only allowed within 24 hours of created_at, enforced server-side.
 * Admin only.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const body = await request.json()

  // Check if visit exists and is editable (within 24h)
  const { data: visit, error: fetchError } = await serviceClient
    .from('visits')
    .select('id, created_at')
    .eq('id', params.id)
    .single()

  if (fetchError || !visit) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  }

  if (!isWithinVisitEditWindow(visit.created_at)) {
    return NextResponse.json({ 
      error: 'Visit can only be edited within 24 hours of creation' 
    }, { status: 403 })
  }

  // Build update object
  const updateData: Record<string, unknown> = {}
  if (body.checklist !== undefined) updateData.checklist = body.checklist
  if (body.note !== undefined) updateData.note = body.note
  if (body.admin_note !== undefined) updateData.admin_note = body.admin_note

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error: updateError } = await serviceClient
    .from('visits')
    .update(updateData)
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  revalidatePath('/visits')
  return NextResponse.json({ success: true })
}
