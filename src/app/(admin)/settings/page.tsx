export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { GmailConnect } from '@/components/features/gmail-connect'
import { LodgifyPropertyMapper } from '@/components/features/lodgify-property-mapper'
import { UserManagement } from '@/components/features/user-management'
import { IntegrationHealth } from '@/components/features/integration-health'
import { SeasonalTemplateSettings } from '@/components/features/seasonal-template-settings'
import { isGmailConnected } from '@/lib/gmail'
import { CanvaConnect } from '@/components/features/canva-connect'
import { CanvaStatusToast } from '@/components/features/canva-status-toast'
import { loadCanvaTokens } from '@/lib/canva'

export default async function SettingsPage() {
  let gmailConnected = false
  try {
    gmailConnected = await isGmailConnected()
  } catch {
    // Gmail check failed — show as disconnected
  }

  let canvaConnected = false
  try {
    canvaConnected = !!(await loadCanvaTokens())
  } catch {
    canvaConnected = false
  }

  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <CanvaStatusToast />
      </Suspense>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Manage integrations and system configuration.
        </p>
      </div>

      {/* Integration Health Dashboard */}
      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Integration Status
        </p>
        <IntegrationHealth />
      </section>

      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Team & Access
        </p>
        <UserManagement />
      </section>

      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Lodgify Integration
        </p>
        <LodgifyPropertyMapper />
      </section>

      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Gmail Integration
        </p>
        <Suspense fallback={null}>
          <GmailConnect isConnected={gmailConnected} />
        </Suspense>
      </section>

      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Canva Integration
        </p>
        <CanvaConnect connected={canvaConnected} />
      </section>

      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Seasonal Templates
        </p>
        <SeasonalTemplateSettings />
      </section>

      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Account
        </p>
        <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Password</h3>
              <p className="text-xs text-muted-foreground">Change your admin login password.</p>
            </div>
            <a href="/login/reset">
              <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                Change Password
              </button>
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
