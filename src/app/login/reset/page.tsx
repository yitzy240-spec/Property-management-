'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FullScreenLoader } from '@/components/ui/logo-spinner'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const isSetup = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('setup') === '1'

  // Supabase implicit flow: session tokens arrive as URL hash fragments.
  // The @supabase/ssr browser client does NOT auto-parse hash fragments,
  // so we manually extract the tokens and set the session.
  useEffect(() => {
    async function initSession() {
      const supabase = createClient()

      // Check if hash contains recovery tokens
      const hash = window.location.hash.substring(1)
      if (hash) {
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (accessToken && refreshToken) {
          // Manually set the session from hash tokens
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (!sessionError) {
            // Clear the hash from URL (tokens are sensitive)
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
            setReady(true)
            return
          }
        }
      }

      // Fallback: check if session already exists (e.g. page reload)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) setReady(true)
    }

    initSession()
  }, [])

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const password = formData.get('password') as string
    const confirm = formData.get('confirm') as string

    if (password !== confirm) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    // Update password client-side (session is only in the browser, not on the server)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Get user role to redirect appropriately
    const { data: { user } } = await supabase.auth.getUser()
    const role = user?.app_metadata?.role

    router.push(role === 'owner' ? '/owner' : '/dashboard')
  }

  if (loading) {
    return <FullScreenLoader text="Updating password..." />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <img
            src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400"
            alt="Marcus Properties"
            className="mx-auto mb-4 h-16 w-auto"
          />
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">
            {isSetup ? 'Create Your Password' : 'Set New Password'}
          </h1>
          {isSetup && (
            <p className="mt-1 text-sm text-muted-foreground">
              Set a password so you can sign in directly next time.
            </p>
          )}
        </div>

        <div className="rounded-[10px] border border-border bg-card shadow-md">
          <div className="p-6">
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  New Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Confirm Password
                </Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  required
                  minLength={6}
                  className="h-11"
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                Update Password
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
