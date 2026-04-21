'use server'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { sendOwnerLoginLink } from '@/lib/email'

export async function loginWithEmail(formData: FormData) {
  const supabase = createServerSupabaseClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const destination = (formData.get('destination') as string) || 'owner'

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  if (destination === 'admin') {
    redirect('/dashboard')
  }

  const serviceClient = createServiceClient()
  const { data: owner } = await serviceClient
    .from('owners')
    .select('id')
    .eq('auth_user_id', data.user.id)
    .single()

  if (owner) {
    redirect('/owner')
  }

  redirect('/dashboard')
}

export async function sendOwnerMagicLink(formData: FormData): Promise<{ success?: boolean; error?: string }> {
  const email = formData.get('email') as string

  const serviceClient = createServiceClient()
  const { data: owner } = await serviceClient
    .from('owners')
    .select('id, full_name')
    .eq('email', email)
    .single()

  if (!owner) {
    // Return generic success to prevent email enumeration
    return { success: true }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.marcus-properties.com'

  // Generate magic link via admin API (doesn't send email itself)
  const { data: linkData } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${appUrl}/auth/callback?next=/owner`,
    },
  })

  const magicLink = linkData?.properties?.action_link

  if (magicLink) {
    // Send branded email via Resend
    await sendOwnerLoginLink(email, owner.full_name, magicLink)
  } else {
    // Fallback to Supabase's built-in email
    const supabase = createServerSupabaseClient()
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback?next=/owner`,
      },
    })
  }

  return { success: true }
}

export async function resetPassword(formData: FormData) {
  const email = formData.get('email') as string

  if (!email) {
    return { error: 'Email is required' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.marcus-properties.com'
  const serviceClient = createServiceClient()

  // Generate reset link via admin API
  // Route through /auth/callback so PKCE code gets exchanged for a session
  const { data: linkData } = await serviceClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${appUrl}/login/reset`,
    },
  })

  const resetLink = linkData?.properties?.action_link

  if (resetLink) {
    // Send branded email via Resend
    const { sendEmail } = await import('@/lib/email')
    await sendEmail({
      to: email,
      subject: 'Reset Your Password — ApartmentOS',
      html: `
        <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
          <h2 style="color: #1E3A5F; margin: 0 0 8px;">Reset Your Password</h2>
          <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px;">
            Click below to set a new password for your ApartmentOS account.
          </p>
          <a href="${resetLink}" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">Reset Password</a>
          <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          <p style="color: #9CA3AF; font-size: 11px; margin-top: 16px;">— Marcus Properties via ApartmentOS</p>
        </div>
      `,
    })
  } else {
    // Fallback to Supabase's built-in email
    const supabase = createServerSupabaseClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/login/reset`,
    })
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

  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.app_metadata?.role
  redirect(role === 'owner' ? '/owner' : '/dashboard')
}

export async function signOut() {
  const supabase = createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}
