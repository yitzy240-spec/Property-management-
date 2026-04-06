'use client'

import { useState, useEffect } from 'react'
import { Fingerprint, X } from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * Shows a prompt to enable biometric login after the user signs in.
 * Only shows if:
 * - WebAuthn is supported
 * - User hasn't dismissed it before
 * - User hasn't already registered a passkey
 */
export function BiometricPrompt() {
  const [show, setShow] = useState(false)
  const [registering, setRegistering] = useState(false)

  useEffect(() => {
    // Check if WebAuthn is available and user hasn't dismissed
    if (
      typeof window === 'undefined' ||
      !window.PublicKeyCredential ||
      localStorage.getItem('biometric_dismissed') === '1' ||
      localStorage.getItem('biometric_registered') === '1'
    ) return

    // Check platform authenticator availability
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
      .then(available => {
        if (available) setShow(true)
      })
      .catch(() => {})
  }, [])

  async function handleEnable() {
    setRegistering(true)
    try {
      // Get registration options from server
      const optionsRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register_options' }),
      })
      if (!optionsRes.ok) throw new Error('Failed to get options')
      const options = await optionsRes.json()

      // Trigger biometric prompt
      const credential = await startRegistration({ optionsJSON: options })

      // Verify with server
      const verifyRes = await fetch('/api/auth/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register_verify', response: credential }),
      })

      if (!verifyRes.ok) throw new Error('Registration failed')

      localStorage.setItem('biometric_registered', '1')
      toast.success('Biometric login enabled')
      setShow(false)
    } catch (err) {
      // User cancelled or error
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        toast.error('Could not set up biometric login')
      }
    } finally {
      setRegistering(false)
    }
  }

  function handleDismiss() {
    localStorage.setItem('biometric_dismissed', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md animate-fade-in">
      <div className="rounded-xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Enable Quick Sign-in</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Use Face ID or fingerprint to sign in instantly next time.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleEnable}
                disabled={registering}
              >
                {registering ? 'Setting up...' : 'Enable'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={handleDismiss}
              >
                Not now
              </Button>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
