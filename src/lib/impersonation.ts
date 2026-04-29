/**
 * Admin "view as owner" impersonation helpers.
 *
 * The admin keeps their own auth session — we only override which owner_id
 * the owner portal data layer fetches. The cookie is honored ONLY when the
 * actual session belongs to a user with role=admin (verified server-side).
 *
 * Routes affected: owner portal pages under (owner)/ only.
 * Admin pages always use the actual admin user — never the impersonated owner.
 *
 * Mutations are read-only while impersonating. Owner-side server actions /
 * route handlers should call assertNotImpersonating() before writing.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

export const IMPERSONATE_COWNER_COOKIE = 'impersonate_owner_id'

/** Result of resolving the effective owner identity for a request. */
export type EffectiveOwner = {
  /** The owner row we should fetch data for. Null when no valid owner is resolved. */
  ownerId: string | null
  /** True when the admin is impersonating an owner (cookie + admin role). */
  isImpersonating: boolean
  /** Display name of the impersonated owner (for the banner). Only set when isImpersonating. */
  impersonatedName: string | null
  /** The actual authenticated user — never swapped. */
  actualUser: User | null
}

/** Cookie reader shape — accepts both Next's ReadonlyRequestCookies and a minimal mock. */
export interface CookieReader {
  get(name: string): { value: string } | undefined
}

/** Treat `next/headers` cookies() return as compatible. */
export type CookieStore = ReadonlyRequestCookies | CookieReader

/** Returns true if the user has admin role. */
export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.app_metadata?.role === 'admin') return true
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && user.email === adminEmail) return true
  return false
}

/**
 * Resolve which owner_id the owner-portal data layer should use.
 *
 * Logic:
 *   1. If no impersonation cookie → use actual user's owner row
 *   2. If cookie set + actual user is admin + target owner exists → impersonate
 *   3. If cookie set but user is NOT admin → ignore cookie (security check)
 *   4. If cookie set but target owner doesn't exist → return null ownerId
 *
 * IMPORTANT: This function uses a service-role client to look up the
 * impersonation target's owner row, since the admin's RLS scope wouldn't
 * normally include arbitrary owners. Admin role is verified BEFORE the
 * service-role lookup to prevent privilege escalation.
 *
 * Callers receiving `isImpersonating: true` MUST use a service-role
 * Supabase client and explicitly filter by ownerId — the admin's auth-scoped
 * RLS policies will not match the impersonated owner's data.
 */
export async function getEffectiveOwnerId(
  authClient: Pick<SupabaseClient, 'auth'>,
  serviceClient: SupabaseClient,
  cookies: CookieStore
): Promise<EffectiveOwner> {
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return { ownerId: null, isImpersonating: false, impersonatedName: null, actualUser: null }
  }

  const cookieValue = cookies.get(IMPERSONATE_COWNER_COOKIE)?.value
  const wantsImpersonate = !!cookieValue
  const userIsAdmin = isAdminUser(user)

  if (wantsImpersonate && userIsAdmin) {
    // Verify the target owner exists. Use service client so we aren't bound
    // by RLS — admin role was already verified above.
    const { data: target, error } = await serviceClient
      .from('owners')
      .select('id, full_name')
      .eq('id', cookieValue)
      .maybeSingle()

    if (error || !target) {
      // Stale or invalid cookie. Don't fall back silently to the admin's own
      // owner record (admins typically don't have one) — return a null
      // ownerId so callers can short-circuit and the user can clear it.
      return {
        ownerId: null,
        isImpersonating: true,
        impersonatedName: null,
        actualUser: user,
      }
    }

    return {
      ownerId: target.id,
      isImpersonating: true,
      impersonatedName: target.full_name,
      actualUser: user,
    }
  }

  // Cookie present but user is NOT admin → ignore cookie entirely.
  // Cookie not present → use actual user's owner row.
  const { data: ownOwner } = await serviceClient
    .from('owners')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return {
    ownerId: ownOwner?.id ?? null,
    isImpersonating: false,
    impersonatedName: null,
    actualUser: user,
  }
}

/**
 * Throw if the current request is in impersonation mode.
 * Owner-side mutating server actions / route handlers should call this
 * before performing writes so the admin's "view as owner" session stays
 * strictly read-only.
 */
export function assertNotImpersonating(cookies: CookieStore): void {
  if (cookies.get(IMPERSONATE_COWNER_COOKIE)?.value) {
    const err = new Error(
      'Impersonation is read-only — exit "view as owner" to make changes.'
    )
    ;(err as Error & { status?: number }).status = 403
    throw err
  }
}
