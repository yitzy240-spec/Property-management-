'use client'

import { useState } from 'react'
import { Eye, EyeOff, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const apiKeys = [
  { key: 'lodgify_api_key', label: 'Lodgify API Key', description: 'For booking financial data (gross rental, channel fees)' },
  { key: 'green_invoice_api_key', label: 'Green Invoice API Key', description: 'For generating Hebrew/English invoices' },
  { key: 'ai_api_key', label: 'AI API Key (Gemini/Claude)', description: 'For bill PDF parsing (~$2/month)' },
  { key: 'gmail_client_id', label: 'Gmail OAuth Client ID', description: 'For bill email parsing' },
  { key: 'gmail_client_secret', label: 'Gmail OAuth Client Secret', description: 'For bill email parsing' },
]

export function ApiKeySettings() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  async function handleSave(settingKey: string) {
    setSaving(settingKey)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value: values[settingKey] }),
      })
      if (!response.ok) throw new Error('Failed to save')
    } catch (err) {
      // TODO: toast notification
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys & Integrations</CardTitle>
        <CardDescription>
          Manage your external service credentials. Keys are encrypted before storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {apiKeys.map((item) => (
          <div key={item.key} className="space-y-2">
            <Label htmlFor={item.key}>{item.label}</Label>
            <p className="text-xs text-muted-foreground">{item.description}</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id={item.key}
                  type={visible[item.key] ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={values[item.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [item.key]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setVisible((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                  }
                >
                  {visible[item.key] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!values[item.key] || saving === item.key}
                onClick={() => handleSave(item.key)}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving === item.key ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
