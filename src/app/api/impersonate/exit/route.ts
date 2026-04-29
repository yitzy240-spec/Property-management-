import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { IMPERSONATE_COWNER_COOKIE } from '@/lib/impersonation'

/**
 * POST or GET /api/impersonate/exit
 *
 * Clears the impersonation cookie. GET is supported so the banner's
 * "Exit impersonation" link can be a plain anchor that redirects back
 * to the admin dashboard without needing client JS.
 */
export async function POST() {
  cookies().delete(IMPERSONATE_COWNER_COOKIE)
  return NextResponse.json({ success: true })
}

export async function GET(request: Request) {
  cookies().delete(IMPERSONATE_COWNER_COOKIE)
  const url = new URL(request.url)
  const next = url.searchParams.get('next') || '/dashboard'
  return NextResponse.redirect(new URL(next, url.origin))
}
