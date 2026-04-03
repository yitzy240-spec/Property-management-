import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, storeGmailTokens } from '@/lib/gmail'

/**
 * GET /api/auth/gmail/callback
 *
 * Google redirects here after OAuth consent.
 * Exchanges the code for tokens, stores encrypted, redirects to Settings.
 */
export async function GET(request: Request) {
  // Verify authenticated
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?gmail_error=${encodeURIComponent(error)}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings?gmail_error=no_code', request.url)
    )
  }

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    await storeGmailTokens(tokens)

    return NextResponse.redirect(
      new URL('/settings?gmail_connected=true', request.url)
    )
  } catch (err) {
    console.error('Gmail OAuth callback error:', err)
    return NextResponse.redirect(
      new URL('/settings?gmail_error=token_exchange_failed', request.url)
    )
  }
}
