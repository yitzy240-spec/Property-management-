import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { property_id, visited_at, checklist, note, admin_note, media } = body

  if (!property_id || !visited_at) {
    return NextResponse.json({ error: 'property_id and visited_at are required' }, { status: 400 })
  }

  const { data: visit, error: visitError } = await serviceClient
    .from('visits')
    .insert({
      property_id,
      visited_at,
      checklist: checklist ?? {},
      note: note || null,
      admin_note: admin_note || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (visitError) {
    return NextResponse.json({ error: visitError.message }, { status: 500 })
  }

  if (media && Array.isArray(media) && media.length > 0) {
    const mediaRows = media.map((m: { file_path: string; file_type: string; is_private: boolean }) => ({
      visit_id: visit.id,
      file_path: m.file_path,
      file_type: m.file_type,
      is_private: m.is_private,
    }))

    const { error: mediaError } = await serviceClient
      .from('visit_media')
      .insert(mediaRows)

    if (mediaError) {
      return NextResponse.json({ error: mediaError.message }, { status: 500 })
    }
  }

  // Revalidate all pages that show visit data
  revalidatePath('/visits')
  revalidatePath('/properties')
  revalidatePath(`/properties/${property_id}`)

  return NextResponse.json({ id: visit.id })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const visitId = searchParams.get('id')

  if (!visitId) {
    return NextResponse.json({ error: 'Visit ID is required' }, { status: 400 })
  }

  // Get the visit first to know the property_id for revalidation
  const { data: visit } = await serviceClient
    .from('visits')
    .select('property_id')
    .eq('id', visitId)
    .single()

  // Delete media first (cascade should handle this, but be explicit)
  await serviceClient
    .from('visit_media')
    .delete()
    .eq('visit_id', visitId)

  const { error } = await serviceClient
    .from('visits')
    .delete()
    .eq('id', visitId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/visits')
  revalidatePath('/properties')
  if (visit) revalidatePath(`/properties/${visit.property_id}`)

  return NextResponse.json({ success: true })
}
