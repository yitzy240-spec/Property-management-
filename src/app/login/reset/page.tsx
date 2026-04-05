'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FullScreenLoader } from '@/components/ui/logo-spinner'
import { updatePassword } from '../actions'

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

    const result = await updatePassword(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
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
            Set New Password
          </h1>
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
