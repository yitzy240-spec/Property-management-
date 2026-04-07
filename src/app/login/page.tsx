'use client'

import { useState, useEffect } from 'react'
import { Loader2, Fingerprint } from 'lucide-react'
import { startAuthentication } from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FullScreenLoader } from '@/components/ui/logo-spinner'
import { loginWithEmail, sendOwnerMagicLink } from './actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [hasBiometric, setHasBiometric] = useState(false)

  useEffect(() => {
    // Check if user has registered a passkey on this device
    if (typeof window !== 'undefined' && localStorage.getItem('biometric_registered') === '1') {
      setHasBiometric(true)
    }
  }, [])

  async function handleBiometricLogin() {
    setLoading(true)
    setError(null)
    try {
      // Get auth options
      const optionsRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login_options' }),
      })
      if (!optionsRes.ok) throw new Error('No passkey found')
      const options = await optionsRes.json()

      // Trigger biometric
      const credential = await startAuthentication({ optionsJSON: options })

      // Verify with server
      const verifyRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login_verify',
          response: credential,
          challengeId: options.challengeId,
        }),
      })

      if (!verifyRes.ok) throw new Error('Verification failed')

      const { redirect_url } = await verifyRes.json()

      // Navigate to Supabase callback to exchange for session
      if (redirect_url) {
        window.location.href = redirect_url
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        // User cancelled biometric
        setLoading(false)
        return
      }
      setError('Biometric login failed. Use password instead.')
      localStorage.removeItem('biometric_registered')
      setHasBiometric(false)
      setLoading(false)
    }
  }

  async function handlePasswordLogin(e: React.FormEvent<HTMLFormElement>) {
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

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const result = await sendOwnerMagicLink(formData)
    if (result?.error) {
      if (result.error.includes('rate') || result.error.includes('limit')) {
        setMagicLinkSent(true)
      } else {
        setError(result.error)
      }
    } else {
      setMagicLinkSent(true)
    }
    setLoading(false)
  }

  if (loading) {
    return <FullScreenLoader text={mode === 'password' ? 'Signing in...' : 'Sending login link...'} />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(213 56% 24% / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(213 56% 24% / 0.4) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <img
            src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400"
            alt="Marcus Properties"
            className="mx-auto mb-4 h-16 w-auto"
          />
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">
            Owner Portal
          </h1>
        </div>

        {hasBiometric && (
          <button
            onClick={handleBiometricLogin}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-card py-3.5 text-sm font-medium shadow-md transition-colors hover:bg-muted"
          >
            <Fingerprint className="h-5 w-5 text-primary" />
            Sign in with biometrics
          </button>
        )}

        <div className="rounded-[10px] border border-border bg-card shadow-md">
          <div className="p-6">
            {magicLinkSent ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(152_54%_25%/0.1)]">
                  <svg className="h-5 w-5 text-financial-income" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground">
                  Check your email
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a login link to your inbox.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  After your first login, you can set a password to sign in directly from the app.
                </p>
                <button
                  type="button"
                  onClick={() => { setMagicLinkSent(false); setError(null) }}
                  className="mt-4 text-sm font-medium text-primary hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : mode === 'password' ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="your@email.com"
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Password
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
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
                  disabled={loading}
                  className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
                </Button>

                <button
                  type="button"
                  onClick={() => { setMode('magic'); setError(null) }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  First time? Sign in with email link instead
                </button>
              </form>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="magic-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email
                  </Label>
                  <Input
                    id="magic-email"
                    name="email"
                    type="email"
                    placeholder="your@email.com"
                    required
                    className="h-11"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll send you a login link — no password needed.
                </p>

                {error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : 'Send Login Link'}
                </Button>

                <button
                  type="button"
                  onClick={() => { setMode('password'); setError(null) }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  Already have a password? Sign in with password
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Jerusalem Property Management
        </p>
      </div>
    </div>
  )
}
