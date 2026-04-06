import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/properties') ||
    pathname.startsWith('/bills') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/financials') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/vault') ||
    pathname.startsWith('/contractors') ||
    pathname.startsWith('/messages') ||
    pathname.startsWith('/owners') ||
    pathname.startsWith('/owner')

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')

  if ((isProtectedRoute || isAdminRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = isAdminRoute ? '/admin/login' : '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
