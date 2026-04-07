import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

/**
 * GET /api/users — List all admin users
 * POST /api/users — Create a new admin user (sends invite email via Supabase)
 * DELETE /api/users — Remove admin role (doesn't delete user)
 */
export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  // List all users with admin role via Supabase Auth admin API
  const { data: { users }, error } = await serviceClient.auth.admin.listUsers()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const adminUsers = (users ?? [])
    .filter(u => u.app_metadata?.role === 'admin')
    .map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at,
    }))

  const ownerUsers = (users ?? [])
    .filter(u => u.app_metadata?.role === 'owner')
    .map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at,
    }))

  return NextResponse.json({ admins: adminUsers, owners: ownerUsers })
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email, role } = await request.json()

  if (!email || !['admin', 'owner'].includes(role)) {
    return NextResponse.json({ error: 'email and role (admin/owner) required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Create user with Supabase Auth admin API
  const { data: newUser, error } = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role },
  })

  if (error) {
    // User might already exist — try updating their role
    if (error.message?.includes('already been registered')) {
      const { data: { users } } = await serviceClient.auth.admin.listUsers()
      const existingUser = users?.find(u => u.email === email)

      if (existingUser) {
        const { error: updateError } = await serviceClient.auth.admin.updateUserById(
          existingUser.id,
          { app_metadata: { role } }
        )
        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 })
        }
        return NextResponse.json({ success: true, user_id: existingUser.id, message: `Updated existing user to ${role}` })
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Send password setup email via Resend
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://apartmentos.app'
  const loginPath = role === 'admin' ? '/admin/login' : '/login'

  const { data: linkData } = await serviceClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${appUrl}/login/reset?setup=1`,
    },
  })

  const resetLink = linkData?.properties?.action_link

  if (resetLink) {
    await sendEmail({
      to: email,
      subject: `You've been added to ApartmentOS`,
      html: `
        <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
          <h2 style="color: #1E3A5F; margin: 0 0 8px;">Welcome to ApartmentOS</h2>
          <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px;">
            You've been added as ${role === 'admin' ? 'an administrator' : 'an owner'}. Set your password to get started.
          </p>
          <a href="${resetLink}" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">Set Your Password</a>
          <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">After setting your password, sign in at <strong>${appUrl}${loginPath}</strong></p>
          <p style="color: #9CA3AF; font-size: 11px; margin-top: 16px;">— Marcus Properties via ApartmentOS</p>
        </div>
      `,
    })
  }

  return NextResponse.json({
    success: true,
    user_id: newUser.user.id,
    message: `${role} user created — password setup email sent.`,
  })
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user_id } = await request.json()
  if (!user_id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Remove role but don't delete user (preserves audit trail)
  const { error } = await serviceClient.auth.admin.updateUserById(user_id, {
    app_metadata: { role: 'disabled' },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
