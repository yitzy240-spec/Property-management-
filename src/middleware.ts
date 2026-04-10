import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Run middleware ONLY on protected routes.
     * Public routes (login, contractor/*, guest/*, api/webhooks/*, api/cron/*,
     * _next/*, favicon) are excluded by not being listed here.
     */
    '/admin/:path*',
    '/dashboard/:path*',
    '/properties/:path*',
    '/bills/:path*',
    '/tasks/:path*',
    '/financials/:path*',
    '/calendar/:path*',
    '/settings/:path*',
    '/inventory/:path*',
    '/vault/:path*',
    '/contractors/:path*',
    '/messages/:path*',
    '/owners/:path*',
    '/reports/:path*',
    '/notifications/:path*',
    '/owner/:path*',
    '/api/((?!webhooks|cron|contractor|auth).*)',
  ],
}
