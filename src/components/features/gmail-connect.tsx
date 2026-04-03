'use client'

import { useSearchParams } from 'next/navigation'
import { Mail, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function GmailConnect({ isConnected }: { isConnected: boolean }) {
  const searchParams = useSearchParams()
  const gmailConnected = searchParams.get('gmail_connected') === 'true'
  const gmailError = searchParams.get('gmail_error')

  const connected = isConnected || gmailConnected

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Gmail Integration</CardTitle>
            <CardDescription>
              Connect your Gmail to automatically parse utility bills from email.
            </CardDescription>
          </div>
          {connected ? (
            <Badge className="gap-1 bg-green-100 text-green-800">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {gmailError && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {gmailError === 'no_code'
              ? 'Authorization was cancelled.'
              : gmailError === 'token_exchange_failed'
              ? 'Failed to connect. Make sure Gmail Client ID and Secret are set in API Keys above.'
              : `Error: ${gmailError}`}
          </div>
        )}

        {connected ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Gmail is connected. Bills with PDF attachments will be automatically detected and parsed.
            </p>
            <a href="/api/auth/gmail">
              <Button variant="outline" size="sm">
                <Mail className="mr-2 h-3.5 w-3.5" />
                Reconnect Gmail
              </Button>
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              First, add your Gmail OAuth Client ID and Client Secret in the API Keys section above.
              Then click Connect to authorize ApartmentOS to read your bill emails.
            </p>
            <a href="/api/auth/gmail">
              <Button>
                <Mail className="mr-2 h-4 w-4" />
                Connect Gmail
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
