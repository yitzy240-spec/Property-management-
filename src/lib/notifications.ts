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

    if (!adminEmail) {
      console.warn('[Notification] ADMIN_EMAIL not set')
      return
    }

    // Check cache first
    const { data: cached } = await serviceClient
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_user_id')
      .single()

    if (cached?.value) {
      await createNotification({ userId: cached.value, title, body, link })
      return
    }

    // No cache — find admin by email using generateLink (doesn't scan all users)
    const { data: linkData } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email: adminEmail,
    })

    const adminUserId = linkData?.user?.id
    if (!adminUserId) {
      console.error('[Notification] Could not find admin user for', adminEmail)
      return
    }

    // Cache for future
    await serviceClient.from('app_settings').upsert({
      key: 'admin_user_id',
      value: adminUserId,
      description: 'Cached admin user ID for notifications',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

    await createNotification({ userId: adminUserId, title, body, link })
  } catch (err) {
    console.error('[Notification] Failed to notify admins:', err)
  }
}
