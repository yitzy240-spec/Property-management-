'use client'

import { useState, useEffect } from 'react'
import { StatusBadge } from '@/components/ui/status-badge'

interface IntegrationStatus {
  key: string
  name: string
  status: 'connected' | 'not_configured' | 'error'
  detail?: string
}

// SVG logos for each integration
function LodgifyLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#0066FF"/>
      <path d="M8 22V10h3v9h5v3H8z" fill="white"/>
    </svg>
  )
}

function GreenInvoiceLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#2ECC71"/>
      <path d="M10 16l4 4 8-8" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function GmailLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#EA4335"/>
      <path d="M8 11l8 5.5L24 11v11H8V11z" fill="white"/>
      <path d="M8 11l8 5.5L24 11" stroke="#EA4335" strokeWidth="1.5"/>
    </svg>
  )
}

function GeminiLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#1A73E8"/>
      <path d="M16 6c0 5.523-4.477 10-10 10 5.523 0 10 4.477 10 10 0-5.523 4.477-10 10-10-5.523 0-10-4.477-10-10z" fill="white"/>
    </svg>
  )
}

const LOGOS: Record<string, () => JSX.Element> = {
  lodgify: LodgifyLogo,
  green_invoice: GreenInvoiceLogo,
  gmail: GmailLogo,
  gemini: GeminiLogo,
}

export function IntegrationHealth() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const results: IntegrationStatus[] = []

      // Lodgify — check via properties list
      try {
        const res = await fetch('/api/properties/list')
        if (res.ok) {
          const data = await res.json()
          const linked = (data.properties || []).filter((p: { lodgify_property_id?: string }) => p.lodgify_property_id)
          results.push({
            key: 'lodgify',
            name: 'Lodgify',
            status: linked.length > 0 ? 'connected' : 'not_configured',
            detail: `${linked.length}/${(data.properties || []).length} linked`,
          })
        } else {
          results.push({ key: 'lodgify', name: 'Lodgify', status: 'error', detail: 'Auth required' })
        }
      } catch {
        results.push({ key: 'lodgify', name: 'Lodgify', status: 'not_configured' })
      }

      results.push({
        key: 'green_invoice',
        name: 'Green Invoice',
        status: 'connected',
        detail: 'Osek Patur',
      })

      results.push({
        key: 'gmail',
        name: 'Gmail',
        status: 'not_configured',
        detail: 'Click Connect below',
      })

      results.push({
        key: 'gemini',
        name: 'Gemini AI',
        status: 'connected',
        detail: 'Bill parsing',
      })

      setIntegrations(results)
      setLoading(false)
    }
    check()
  }, [])

  if (loading) return null

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {integrations.map((integration) => {
        const Logo = LOGOS[integration.key]
        return (
          <div key={integration.key} className="rounded-[10px] border border-border bg-card px-3 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              {Logo && <Logo />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">{integration.name}</p>
                  <StatusBadge
                    status={integration.status === 'connected' ? 'safe' : integration.status === 'error' ? 'danger' : 'neutral'}
                    label={integration.status === 'connected' ? 'OK' : integration.status === 'error' ? '!' : 'Off'}
                    size="sm"
                  />
                </div>
                {integration.detail && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{integration.detail}</p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
