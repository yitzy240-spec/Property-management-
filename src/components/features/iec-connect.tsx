'use client'

import { useState, useEffect } from 'react'
import { Zap, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

/**
 * IEC Integration for Settings page.
 * One-time auth → gets all contracts → map to properties.
 */
export function IecIntegration() {
  const [connected, setConnected] = useState(false)
  const [contracts, setContracts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/iec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    })
      .then(r => r.json())
      .then(data => {
        setConnected(data.connected || false)
        setContracts(data.contracts || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-6 text-center text-sm text-muted-foreground shadow-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Israel Electric (IEC)</h3>
          <p className="text-xs text-muted-foreground">
            Direct bill sync + PDF download.
          </p>
        </div>
        {connected ? (
          <StatusBadge status="safe" label={`${contracts.length} contracts`} size="sm" />
        ) : (
          <StatusBadge status="neutral" label="Not connected" size="sm" />
        )}
      </div>

      <div className="p-4">
        {connected ? (
          <div className="space-y-4">
            <IecContractMapper contracts={contracts} />
            <div className="flex gap-2">
              <IecSyncButton />
              <IecAuthDrawer onConnect={(c) => { setConnected(true); setContracts(c) }} reconnect />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              One-time setup — enter your Israeli ID, verify with OTP, and all electricity contracts sync automatically.
            </p>
            <IecAuthDrawer onConnect={(c) => { setConnected(true); setContracts(c) }} />
          </div>
        )}
      </div>
    </div>
  )
}

function IecAuthDrawer({ onConnect, reconnect }: { onConnect: (contracts: string[]) => void; reconnect?: boolean }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'id' | 'otp' | 'done'>('id')
  const [loading, setLoading] = useState(false)
  const [israeliId, setIsraeliId] = useState('')
  const [otpCode, setOtpCode] = useState('')

  async function handleSendOtp() {
    if (!israeliId) return
    setLoading(true)
    try {
      const res = await fetch('/api/iec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', israeliId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success('OTP sent to your phone')
      setStep('otp')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otpCode) return
    setLoading(true)
    try {
      const res = await fetch('/api/iec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_otp', israeliId, otpCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`Connected! ${data.contracts?.length || 0} contracts found`)
      setStep('done')
      onConnect(data.contracts || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setStep('id'); setOtpCode('') } }}>
      <DrawerTrigger asChild>
        <Button size="sm" className={reconnect ? 'h-8 gap-1.5 text-xs' : 'h-9 gap-1.5'} variant={reconnect ? 'outline' : 'default'}>
          <Zap className="h-3.5 w-3.5" />
          {reconnect ? 'Reconnect' : 'Connect IEC'}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Connect to Israel Electric</DrawerTitle>
          <DrawerDescription>One-time setup — all contracts under your ID sync automatically.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 p-4">
          {step === 'id' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Israeli ID (ת.ז.)</Label>
              <Input
                type="text" inputMode="numeric" placeholder="123456789"
                value={israeliId} onChange={e => setIsraeliId(e.target.value)}
                className="h-11 font-mono text-center text-lg tracking-widest" maxLength={9}
              />
              <p className="text-[10px] text-muted-foreground">IEC sends OTP to the phone on your account.</p>
            </div>
          )}
          {step === 'otp' && (
            <>
              <div className="rounded-[10px] bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Check your phone for the code</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">OTP Code</Label>
                <Input
                  type="text" inputMode="numeric" placeholder="123456"
                  value={otpCode} onChange={e => setOtpCode(e.target.value)}
                  className="h-11 font-mono text-center text-2xl tracking-[0.3em]" maxLength={6} autoFocus
                />
              </div>
            </>
          )}
          {step === 'done' && (
            <div className="py-6 text-center">
              <Check className="mx-auto h-10 w-10 text-status-safe" />
              <p className="mt-2 text-sm font-medium">IEC Connected</p>
              <p className="mt-1 text-xs text-muted-foreground">All electricity contracts synced.</p>
            </div>
          )}
        </div>
        <DrawerFooter>
          {step === 'id' && (
            <Button onClick={handleSendOtp} disabled={loading || israeliId.length < 7} className="h-11 w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : 'Send OTP'}
            </Button>
          )}
          {step === 'otp' && (
            <Button onClick={handleVerifyOtp} disabled={loading || otpCode.length < 4} className="h-11 w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : 'Verify & Connect'}
            </Button>
          )}
          {step === 'done' && (
            <Button onClick={() => setOpen(false)} className="h-11 w-full">Done</Button>
          )}
          <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function IecContractMapper({ contracts }: { contracts: string[] }) {
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/properties/list')
      .then(r => r.json())
      .then(data => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [])

  if (contracts.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Map Contracts to Properties</p>
      {contracts.map(contractId => (
        <div key={contractId} className="flex items-center gap-2 rounded-lg border border-border p-2">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">#{contractId}</span>
          <NativeSelect
            value={mappings[contractId] || ''}
            onChange={e => {
              setMappings(prev => ({ ...prev, [contractId]: e.target.value }))
              toast.success('Contract mapped')
            }}
            placeholder="Select property"
            options={properties.map(p => ({ value: p.id, label: p.name }))}
            className="h-9 text-xs"
          />
        </div>
      ))}
    </div>
  )
}

function IecSyncButton() {
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/iec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      })
      const data = await res.json()
      toast.success(data.synced > 0 ? `Synced ${data.synced} bills` : 'All bills up to date')
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSync} disabled={syncing}>
      {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
      {syncing ? 'Syncing...' : 'Sync Bills'}
    </Button>
  )
}
