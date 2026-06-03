import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdmin, AuthError } from '@/lib/auth'
import { exchangeCodeForTokens, storeCanvaTokens } from '@/lib/canva'

export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieStore = cookies()
  const expectedState = cookieStore.get('canva_oauth_state')?.value

  if (!code) {
    return NextResponse.redirect(new URL('/settings?canva=missing_code', request.url))
  }
  if (!state || state !== expectedState) {
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
