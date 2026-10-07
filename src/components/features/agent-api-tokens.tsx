'use client'

import { useEffect, useState } from 'react'
import { Bot, Copy, Check, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TokenRow {
  id: string
  name: string
  token_prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

interface AuditRow {
  id: string
  token_name: string | null
  method: string
  path: string
  action: string
  created_at: string
}

// Plain-language labels; mirrors AGENT_SCOPES in lib/agent-api/core.
const SCOPE_LABELS: Record<string, string> = {
  'bookings:read': 'Read bookings',
  'bookings:write': 'Edit bookings & payments',
  'tasks:read': 'Read tasks & cleaners',
  'tasks:write': 'Edit tasks',
  'properties:read': 'Read properties',
  'owners:read': 'Read owners',
  'owners:write': 'Edit owners',
  'utilities:read': 'Read utility accounts',
  'utilities:write': 'Edit utility accounts',
  'bills:read': 'Read bills',
  'bills:write': 'Add & edit bills',
  'codes:read': 'Door codes & WiFi (logged)',
}

function when(iso: string | null) {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short' })
}

export function AgentApiTokens() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [scopes, setScopes] = useState<string[]>([])
  const [name, setName] = useState('Grok Bot')
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    const res = await fetch('/api/settings/agent-tokens')
    if (!res.ok) return
    const data = await res.json()
    setTokens(data.tokens)
    setAudit(data.audit)
    setScopes(data.scopes)
    setSelected((s) => (s.length ? s : data.scopes.filter((x: string) => x !== 'codes:read')))
  }

  useEffect(() => {
    load()
  }, [])

  async function create() {
    setCreating(true)
    try {
      const res = await fetch('/api/settings/agent-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSecret(data.secret)
      setCopied(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create token')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(token: TokenRow) {
    if (!confirm(`Revoke "${token.name}"? Anything using it stops working immediately.`)) return
    const res = await fetch(`/api/settings/agent-tokens?id=${token.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Token revoked')
      load()
    } else {
      toast.error('Revoke failed')
    }
  }

  async function copySecret() {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-5 w-5 text-accent" />
          <div>
            <h3 className="text-sm font-semibold">Connect an AI agent (e.g. Grok Bot)</h3>
            <p className="text-xs text-muted-foreground">
              Creates a key the agent uses to read and update ApartmentOS. Give it only what it needs; every change it makes is logged below.
              API guide: <a href="/api/agent/v1" target="_blank" className="font-medium text-accent hover:underline">/api/agent/v1</a>
            </p>
          </div>
        </div>

        {secret ? (
          <div className="mt-4 space-y-2 rounded-lg border border-status-warning/40 bg-[hsl(38_92%_50%/0.06)] p-3">
            <p className="text-xs font-semibold">Copy this key now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 select-all break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">{secret}</code>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={copySecret}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Paste it into the agent&apos;s secret store (never into a chat).</p>
            <button type="button" onClick={() => setSecret(null)} className="text-xs font-medium text-accent hover:underline">Done</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-token-name" className="text-xs font-medium">Name</Label>
              <Input id="agent-token-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Access</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {scopes.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selected.includes(scope)}
                      onChange={(e) =>
                        setSelected((s) => (e.target.checked ? [...s, scope] : s.filter((x) => x !== scope)))
                      }
                    />
                    {SCOPE_LABELS[scope] ?? scope}
                  </label>
                ))}
              </div>
            </div>
            <Button type="button" onClick={create} disabled={creating || !name.trim() || selected.length === 0} className="h-9 gap-1.5 text-xs">
              <KeyRound className="h-3.5 w-3.5" />
              {creating ? 'Creating…' : 'Create key'}
            </Button>
          </div>
        )}
      </div>

      {tokens.length > 0 && (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          {tokens.map((t, i) => (
            <div key={t.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t.name} <span className="font-mono text-xs text-muted-foreground">{t.token_prefix}…</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.revoked_at ? `Revoked ${when(t.revoked_at)}` : `Last used ${when(t.last_used_at)}`} · {t.scopes.length} permissions
                  {t.scopes.includes('codes:read') ? ' · incl. door codes' : ''}
                </p>
              </div>
              {!t.revoked_at && (
                <button type="button" onClick={() => revoke(t)} className="shrink-0 text-xs font-medium text-destructive hover:underline">
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {audit.length > 0 && (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          <p className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent agent activity</p>
          {audit.map((a, i) => (
            <div key={a.id} className={`flex items-center justify-between gap-3 px-4 py-2 text-xs ${i > 0 ? 'border-t border-border' : ''}`}>
              <span className="min-w-0 truncate">
                <span className="font-medium">{a.token_name ?? 'agent'}</span> · {a.action} · <span className="font-mono">{a.method} {a.path.replace('/api/agent/v1', '')}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">{when(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
