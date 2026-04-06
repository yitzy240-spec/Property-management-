'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { FullScreenLoader } from '@/components/ui/logo-spinner'

/**
 * /open?to=/owner
 * Intermediate page for email links — attempts to open the PWA
 * if installed, otherwise redirects in the browser.
 */
export default function OpenRedirect() {
  const searchParams = useSearchParams()
  const to = searchParams.get('to') || '/owner'

  useEffect(() => {
    // Check if running as installed PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true

    if (isStandalone) {
      // Already in PWA — just navigate
      window.location.href = to
    } else {
      // In browser — redirect normally
      // On Android, the browser may offer to open in the PWA if it's installed
      window.location.href = to
    }
  }, [to])

  return <FullScreenLoader text="Opening ApartmentOS..." />
}
