import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCodeForTokens, storeCanvaTokens } from '@/lib/canva'

// This callback is a cross-site redirect back from canva.com. The Supabase
// session cookie is NOT reliably present here — the session-refreshing
// middleware (updateSession) explicitly excludes /api/auth/*, and a cross-site
// return is not guaranteed to carry/refresh the app session. So we do NOT gate
// on requireAdmin() (doing so returned 401 and broke the connect flow).
//
// Instead the flow is authenticated by the unforgeable `canva_oauth_state`
// cookie (httpOnly, SameSite=Lax, 16 random bytes) that the START route set —
// and that route DOES require admin. A valid matching state therefore proves an
// authenticated admin initiated this exact flow. That is the standard OAuth
// CSRF/authenticity gate; a non-admin cannot make the start route mint a state.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieStore = cookies()
  const expectedState = cookieStore.get('canva_oauth_state')?.value

  if (!code) {
    return NextResponse.redirect(new URL('/settings?canva=missing_code', request.url))
  }
  if (!expectedState || !state || state !== expectedState) {
    return NextResponse.redirect(new URL('/settings?canva=state_mismatch', request.url))
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    await storeCanvaTokens(tokens)
  } catch (err) {
    // Log server-side; client toast uses whitelisted codes only.
    console.error('[canva oauth] callback failed:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(new URL('/settings?canva=error', request.url))
  }

  const response = NextResponse.redirect(new URL('/settings?canva=connected', request.url))
  response.cookies.delete('canva_oauth_state')
  return response
}
