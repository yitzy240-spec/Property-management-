import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/encryption'

export async function POST(request: Request) {
  // Verify user is authenticated
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // TODO: verify user is admin (not just any authenticated user)

  const { key, value } = await request.json()

  if (!key || !value) {
    return NextResponse.json({ error: 'Key and value required' }, { status: 400 })
  }

  try {
    const encryptedValue = await encrypt(value)

    // Use service client to bypass RLS (app_settings has no user policies)
    const serviceClient = createServiceClient()

    const { error } = await serviceClient
      .from('app_settings')
      .upsert(
        {
          key,
          value: encryptedValue,
          description: `Updated via admin UI`,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: 'key' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to encrypt and save setting' },
      { status: 500 }
    )
  }
}
