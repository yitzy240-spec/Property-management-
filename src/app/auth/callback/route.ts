import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

/**
 * GET /auth/callback
 * Handles Supabase auth redirects (magic links, OAuth, password reset).
 * Exchanges the code for a session, then redirects to the intended page.
 *
 * Uses a custom Supabase client that collects cookies during code exchange,
 * then applies them to the redirect response so the session persists.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const type = url.searchParams.get('type')
  const raw = url.searchParams.get('next') || '/owner'
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/owner'

  // Determine redirect destination
  let redirectPath = next
  if (type === 'recovery' || next === '/login/reset') {
    const setup = url.searchParams.get('setup')
    redirectPath = setup ? '/login/reset?setup=1' : '/login/reset'
  }

  const response = NextResponse.redirect(new URL(redirectPath, url.origin))

  if (code) {
    const cookieStore = cookies()

    // Create a Supabase client that writes session cookies onto the response
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options as Record<string, string>)
            })
          },
        },
      },
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(new URL('/login?error=expired', url.origin))
    }
  }

  return response
}
