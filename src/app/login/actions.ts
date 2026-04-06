'use server'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginWithEmail(formData: FormData) {
  const supabase = createServerSupabaseClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const destination = (formData.get('destination') as string) || 'owner'

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  // If logging in from /login (owner portal), go to /owner
  // If logging in from /admin/login, go to /dashboard
  if (destination === 'admin') {
    redirect('/dashboard')
  }

  // Check if this user is also an owner
  const serviceClient = createServiceClient()
  const { data: owner } = await serviceClient
    .from('owners')
    .select('id')
    .eq('auth_user_id', data.user.id)
    .single()

  if (owner) {
    redirect('/owner')
  }

  // Admin with no owner record — send to dashboard
  redirect('/dashboard')
}

export async function sendOwnerMagicLink(formData: FormData) {
  const supabase = createServerSupabaseClient()

  const email = formData.get('email') as string

  // Use service client for owner lookup — no auth session exists at login time
  const serviceClient = createServiceClient()
  const { data: owner } = await serviceClient
    .from('owners')
    .select('id')
    .eq('email', email)
    .single()

  if (!owner) {
    // Return generic success to prevent email enumeration
    return { success: true }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/owner`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function resetPassword(formData: FormData) {
  const supabase = createServerSupabaseClient()
  const email = formData.get('email') as string

  if (!email) {
    return { error: 'Email is required' }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login/reset`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updatePassword(formData: FormData) {
  const supabase = createServerSupabaseClient()
  const password = formData.get('password') as string

  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: error.message }
  }

  // Redirect based on role
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.app_metadata?.role
  redirect(role === 'owner' ? '/owner' : '/dashboard')
}

export async function signOut() {
  const supabase = createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}
