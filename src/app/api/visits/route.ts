import { NextRequest, NextResponse } from 'next/server'
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

  return NextResponse.json({ id: visit.id })
}
