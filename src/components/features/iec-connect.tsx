'use client'

import { useState, useEffect } from 'react'
import { Zap, Check, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
 * Per-property IEC integration.
 * Each property has its own TZ / IEC account.
 */
export function IecConnect({ propertyId }: { propertyId: string }) {
  const [connected, setConnected] = useState(false)
  const [contracts, setContracts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetch('/api/iec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', propertyId }),
    })
      .then(r => r.json())
      .then(data => {
        setConnected(data.connected || false)
        setContracts(data.contracts || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [propertyId])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/iec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', propertyId }),
      })
      const data = await res.json()
      if (data.synced > 0) {
        toast.success(`Synced ${data.synced} IEC bill${data.synced > 1 ? 's' : ''}`)
      } else {
        toast.success('All IEC bills up to date')
      }
    } catch {
      toast.error('IEC sync failed')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return null

  if (!connected) {
    return (
      <IecAuthDrawer
        propertyId={propertyId}
        onConnect={(c) => { setConnected(true); setContracts(c) }}
      />
    )
  }

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status="safe" label={`IEC · ${contracts.length} contract${contracts.length !== 1 ? 's' : ''}`} size="sm" />
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleSync} disabled={syncing}>
        {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Sync
      </Button>
      <IecAuthDrawer
        propertyId={propertyId}
        onConnect={(c) => { setConnected(true); setContracts(c) }}
        reconnect
      />
    </div>
  )
}

function IecAuthDrawer({ propertyId, onConnect, reconnect }: { propertyId: string; onConnect: (contracts: string[]) => void; reconnect?: boolean }) {
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
        body: JSON.stringify({ action: 'verify_otp', israeliId, otpCode, propertyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`IEC connected — ${data.contracts?.length || 0} contracts found`)
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
        <Button size="sm" className={reconnect ? 'h-7 gap-1 text-xs' : 'h-8 gap-1.5 text-xs'} variant={reconnect ? 'ghost' : 'outline'}>
          <Zap className="h-3 w-3" />
          {reconnect ? 'Re-auth' : 'Connect IEC'}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Connect to Israel Electric</DrawerTitle>
          <DrawerDescription>Enter the ID registered with this property&apos;s IEC account.</DrawerDescription>
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
              <p className="text-[10px] text-muted-foreground">
                IEC only supports ת.ז. (not passport). OTP will be sent to the phone on this account.
              </p>
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
              <p className="mt-1 text-xs text-muted-foreground">Electricity bills will sync automatically.</p>
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
