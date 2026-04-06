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
  const next = url.searchParams.get('next') || '/owner'

  if (code) {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      // Code exchange failed — redirect to login with error
      return NextResponse.redirect(new URL('/login?error=expired', url.origin))
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
