'use server'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginWithEmail(formData: FormData) {
  const supabase = createServerSupabaseClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

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
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/owner`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function signOut() {
  const supabase = createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}
