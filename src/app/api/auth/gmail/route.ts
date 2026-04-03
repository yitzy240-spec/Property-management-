import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getGmailAuthUrl } from '@/lib/gmail'

/**
 * GET /api/auth/gmail
 *
 * Redirects to Google OAuth consent screen.
 * Admin clicks "Connect Gmail" → hits this endpoint → Google → callback.
 */
export async function GET() {
  // Verify authenticated
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`

  try {
    const authUrl = await getGmailAuthUrl(redirectUri)
    return NextResponse.redirect(authUrl)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build auth URL' },
      { status: 400 }
    )
  }
}
