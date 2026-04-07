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

    // Find admin user by email
    const { data: { users } } = await serviceClient.auth.admin.listUsers()
    const admins = users?.filter(u =>
      u.email === adminEmail || u.app_metadata?.role === 'admin'
    ) || []

    for (const admin of admins) {
      await createNotification({ userId: admin.id, title, body, link })
    }
  } catch (err) {
    console.error('[Notification] Failed to notify admins:', err)
  }
}
