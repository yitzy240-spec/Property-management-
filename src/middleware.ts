import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Run middleware on all routes EXCEPT:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     * - contractor/[token] (public magic link pages)
     * - guest/[token] (public check-in pages)
     * - api/webhooks (incoming webhook endpoints)
     * - login (auth page must be accessible)
     *
     * Note: contractor exclusion uses contractor/[^/]+ to avoid
     * accidentally excluding /dashboard/contractors (admin page)
     */
    '/((?!_next/static|_next/image|favicon.ico|contractor/[^/]+|guest/[^/]+|api/webhooks|login).*)',
  ],
}
