'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FullScreenLoader } from '@/components/ui/logo-spinner'
import { loginWithEmail, resetPassword } from '@/app/login/actions'

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const result = await loginWithEmail(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const result = await resetPassword(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setResetSent(true)
    }
    setLoading(false)
  }

  if (loading) {
    return <FullScreenLoader text={showReset ? 'Sending...' : 'Signing in...'} />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4">
      <div className="relative z-10 w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <img
            src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400"
            alt="Marcus Properties"
            className="mx-auto mb-4 h-16 w-auto"
          />
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">
            Admin Dashboard
          </h1>
        </div>

        <div className="rounded-[10px] border border-border bg-card shadow-md">
          <div className="p-6">
            {showReset ? (
              resetSent ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-foreground">Check your email</p>
                  <p className="mt-1 text-sm text-muted-foreground">We sent a password reset link.</p>
                  <button
                    type="button"
                    onClick={() => { setShowReset(false); setResetSent(false); setError(null) }}
                    className="mt-4 text-sm font-medium text-primary hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <p className="text-sm text-muted-foreground">Enter your email and we&apos;ll send a reset link.</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</Label>
                    <Input id="reset-email" name="email" type="email" placeholder="admin@marcus-properties.com" required className="h-11" />
                  </div>
                  {error && (
                    <div className="rounded-md bg-destructive/10 px-3 py-2">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}
                  <Button type="submit" disabled={loading} className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : 'Send Reset Link'}
                  </Button>
                  <button type="button" onClick={() => { setShowReset(false); setError(null) }} className="w-full text-center text-sm font-medium text-primary hover:underline">
                    Back to sign in
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="admin@marcus-properties.com" required className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</Label>
                    <button type="button" onClick={() => { setShowReset(true); setError(null) }} className="text-[10px] font-medium text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>
                  <Input id="password" name="password" type="password" required className="h-11" />
                </div>
                {error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}
                <Button type="submit" disabled={loading} className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
