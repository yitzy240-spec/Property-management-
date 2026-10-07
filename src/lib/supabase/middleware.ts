import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminUser } from '@/lib/impersonation'

/** Every top-level route in src/app/(admin). */
export const ADMIN_PAGE_PREFIXES = [
  '/dashboard',
  '/properties',
  '/bills',
  '/billing',
  '/tasks',
  '/financials',
  '/calendar',
  '/codes',
  '/settings',
  '/inventory',
  '/vault',
  '/contractors',
  '/messages',
  '/owners',
  '/reports',
  '/visits',
]

export function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Record<string, string>)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // All admin routes under (admin) group + owner portal require auth
  // Public routes (contractor/[token], guest/[token], login, api/webhooks)
  // are excluded by the middleware matcher in src/middleware.ts
  const pathname = request.nextUrl.pathname

  // Admin login page is public
  if (pathname === '/admin/login') {
    return supabaseResponse
  }

  // Pages in the (admin) route group read with the service-role client, so
  // they must be gated on the admin ROLE here — being logged in (e.g. as an
  // owner) is not enough. Keep in sync with src/app/(admin)/* and the matcher.
  const isAdminPage = ADMIN_PAGE_PREFIXES.some(prefix => matchesPrefix(pathname, prefix))
  const isOwnerPage = matchesPrefix(pathname, '/owner')
  const isAdminRoute = matchesPrefix(pathname, '/admin')

  if ((isAdminPage || isOwnerPage || isAdminRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = isAdminRoute ? '/admin/login' : '/login'
    return NextResponse.redirect(url)
  }

  if (isAdminPage && !isAdminUser(user)) {
    const url = request.nextUrl.clone()
    url.pathname = '/owner'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
