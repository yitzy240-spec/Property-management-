import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

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

  return NextResponse.json({
    success: true,
    user_id: newUser.user.id,
    message: `${role} user created. They can sign in at /login.`,
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
