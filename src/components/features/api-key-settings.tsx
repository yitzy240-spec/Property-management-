'use client'

import { useState } from 'react'
import { Eye, EyeOff, Save, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'

const apiKeys = [
  { key: 'ai_api_key', label: 'AI API Key (Gemini)', description: 'For bill PDF parsing. Get one free at aistudio.google.com/apikey', testable: true },
]

export function ApiKeySettings() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  async function handleSave(settingKey: string) {
    setSaving(settingKey)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value: values[settingKey] }),
      })
      if (!response.ok) throw new Error('Failed to save')
      toast.success('API key saved')
    } catch {
      toast.error('Failed to save API key')
    } finally {
      setSaving(null)
    }
  }

  async function handleTest(settingKey: string) {
    const value = values[settingKey]
    if (!value) {
      toast.error('Enter a key first')
      return
    }

    setTesting(settingKey)
    setTestResults(prev => ({ ...prev, [settingKey]: undefined as unknown as { success: boolean; message: string } }))

    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value }),
      })
      const result = await response.json()

      setTestResults(prev => ({ ...prev, [settingKey]: result }))

      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('Test failed — network error')
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="rounded-[10px] border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">API Keys</h3>
        <p className="text-xs text-muted-foreground">Keys are encrypted before storage.</p>
      </div>
      <div className="space-y-5 p-4">
        {apiKeys.map((item) => {
          const testResult = testResults[item.key]
          return (
            <div key={item.key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor={item.key} className="text-xs font-medium">{item.label}</Label>
                {testResult && (
                  <StatusBadge
                    status={testResult.success ? 'safe' : 'danger'}
                    label={testResult.success ? 'OK' : 'Failed'}
                    size="sm"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id={item.key}
                    type={visible[item.key] ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    className="h-11 pr-10"
                    value={values[item.key] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [item.key]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                {item.testable && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 gap-1.5"
                    disabled={!values[item.key] || testing === item.key}
                    onClick={() => handleTest(item.key)}
                  >
                    <Zap className={`h-3.5 w-3.5 ${testing === item.key ? 'animate-pulse' : ''}`} />
                    {testing === item.key ? 'Testing...' : 'Test'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 gap-1.5"
                  disabled={!values[item.key] || saving === item.key}
                  onClick={() => handleSave(item.key)}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving === item.key ? '...' : 'Save'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
