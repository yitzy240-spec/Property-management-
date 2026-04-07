import { createServiceClient } from '@/lib/supabase/server'

/**
 * Create an in-app notification for a user.
 * Fire-and-forget — never throws.
 */
export async function createNotification({
  userId,
  title,
  body,
  link,
}: {
  userId: string
  title: string
  body?: string
  link?: string
}) {
  try {
    const serviceClient = createServiceClient()
    await serviceClient.from('notifications').insert({
      user_id: userId,
      title,
      body: body || null,
      link: link || null,
    })
  } catch (err) {
    console.error('[Notification] Failed to create:', err)
  }
}

/**
 * Notify all admin users.
 */
export async function notifyAdmins({
  title,
  body,
  link,
}: {
  title: string
  body?: string
  link?: string
}) {
  try {
    const serviceClient = createServiceClient()
    const adminEmail = process.env.ADMIN_EMAIL

    if (!adminEmail) return

    // Look up admin user directly by email (no listUsers scan)
    const { data: adminOwner } = await serviceClient
      .from('owners')
      .select('auth_user_id')
      .eq('email', adminEmail)
      .single()

    // Also check auth users directly via the admin API
    // Use a targeted approach — get user by email from app_settings cache or direct lookup
    const adminUserIds: string[] = []

    // Try to find admin via stored admin user ID
    const { data: adminSetting } = await serviceClient
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_user_id')
      .single()

    if (adminSetting?.value) {
      adminUserIds.push(adminSetting.value)
    } else {
      // First-time: look up and cache the admin user ID
      const { data: userData } = await serviceClient.auth.admin.getUserById(
        adminOwner?.auth_user_id || ''
      )
      if (userData?.user) {
        adminUserIds.push(userData.user.id)
        // Cache for future lookups
        await serviceClient.from('app_settings').upsert({
          key: 'admin_user_id',
          value: userData.user.id,
          description: 'Cached admin user ID for notifications',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
      }
    }

    for (const userId of adminUserIds) {
      await createNotification({ userId, title, body, link })
    }
  } catch (err) {
    console.error('[Notification] Failed to notify admins:', err)
  }
}
