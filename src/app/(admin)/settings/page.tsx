export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { Separator } from '@/components/ui/separator'
import { ApiKeySettings } from '@/components/features/api-key-settings'
import { GmailConnect } from '@/components/features/gmail-connect'
import { SeasonalTemplateSettings } from '@/components/features/seasonal-template-settings'
import { isGmailConnected } from '@/lib/gmail'

export default async function SettingsPage() {
  let gmailConnected = false
  try {
    gmailConnected = await isGmailConnected()
  } catch {
    // Gmail check failed — show as disconnected
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage integrations, API keys, and system configuration.
        </p>
      </div>

      <ApiKeySettings />

      <Separator />

      <Suspense fallback={null}>
        <GmailConnect isConnected={gmailConnected} />
      </Suspense>

      <Separator />

      <SeasonalTemplateSettings />
    </div>
  )
}
