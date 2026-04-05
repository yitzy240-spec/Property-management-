'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FullScreenLoader } from '@/components/ui/logo-spinner'
import { loginWithEmail, sendOwnerMagicLink } from './actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'admin' | 'owner'>('admin')

  async function handleAdminLogin(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await loginWithEmail(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  async function handleOwnerLogin(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await sendOwnerMagicLink(formData)
    if (result?.error) {
      setError(result.error)
    } else if (result?.success) {
      setMagicLinkSent(true)
    }
    setLoading(false)
  }

  if (loading) {
    return <FullScreenLoader text={tab === 'admin' ? 'Signing in...' : 'Sending link...'} />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4">
      {/* Subtle grid-paper texture (Ledger signature) */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(213 56% 24% / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(213 56% 24% / 0.4) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 w-full max-w-[380px]">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <img
            src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400"
            alt="Marcus Properties"
            className="mx-auto mb-4 h-16 w-auto"
          />
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">
            ApartmentOS
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Marcus Properties
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-[10px] border border-border bg-card shadow-md">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => { setTab('admin'); setError(null); setMagicLinkSent(false) }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === 'admin'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => { setTab('owner'); setError(null) }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === 'owner'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Owner
            </button>
          </div>

          {/* Forms */}
          <div className="p-6">
            {tab === 'admin' ? (
              <form action={handleAdminLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email
                  </Label>
                  <Input
                    id="admin-email"
                    name="email"
                    type="email"
                    placeholder="admin@marcus-properties.com"
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-password" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Password
                  </Label>
                  <Input
                    id="admin-password"
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
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            ) : magicLinkSent ? (
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
                <button
                  type="button"
                  onClick={() => { setMagicLinkSent(false); setError(null) }}
                  className="mt-4 text-sm font-medium text-primary hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : (
              <form action={handleOwnerLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="owner-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email
                  </Label>
                  <Input
                    id="owner-email"
                    name="email"
                    type="email"
                    placeholder="owner@example.com"
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
                  {loading ? 'Sending...' : 'Send Login Link'}
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Jerusalem Property Management
        </p>
      </div>
    </div>
  )
}
