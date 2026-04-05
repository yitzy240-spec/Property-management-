import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Verify the current user is an authenticated admin.
 * Checks app_metadata.role set via Supabase dashboard or auth trigger.
 *
 * For the initial single-admin setup (Marcus), we also allow checking
 * against a hardcoded admin email as a fallback.
 */
export async function requireAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new AuthError('Not authenticated', 401)
  }

  // Check app_metadata role (primary method)
  const role = user.app_metadata?.role
  if (role === 'admin') return user

  // Fallback: check against admin email env var (for initial setup)
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && user.email === adminEmail) return user

  throw new AuthError('Admin access required', 403)
}

/**
 * Verify the current user is authenticated (any role).
 */
export async function requireAuth() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new AuthError('Not authenticated', 401)
  }

  return user
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}
