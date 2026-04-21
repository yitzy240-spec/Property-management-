import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /auth/callback
 * Handles Supabase auth redirects (magic links, OAuth, password reset).
 * Exchanges the code for a session, then redirects to the intended page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const type = url.searchParams.get('type')
  const raw = url.searchParams.get('next') || '/owner'
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/owner'

  if (code) {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(new URL('/login?error=expired', url.origin))
    }
  }

  // Password reset / recovery → send to set password page
  if (type === 'recovery' || next === '/login/reset') {
    const setup = url.searchParams.get('setup')
    const resetUrl = setup ? '/login/reset?setup=1' : '/login/reset'
    return NextResponse.redirect(new URL(resetUrl, url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
