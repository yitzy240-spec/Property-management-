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

interface Factor {
  id: string
  type: string
  email?: string
}

function IecAuthDrawer({ propertyId, onConnect, reconnect }: {
  propertyId: string
  onConnect: (contracts: string[]) => void
  reconnect?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'id' | 'factor' | 'otp' | 'done'>('id')
  const [loading, setLoading] = useState(false)
  const [idNumber, setIdNumber] = useState('')
  const [factors, setFactors] = useState<Factor[]>([])
  const [selectedFactor, setSelectedFactor] = useState<string>('')
  const [otpCode, setOtpCode] = useState('')

  function reset() {
    setStep('id')
    setOtpCode('')
    setFactors([])
    setSelectedFactor('')
  }

  async function handleLogin() {
    if (!idNumber) return
    setLoading(true)
    try {
      const res = await fetch('/api/iec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', israeliId: idNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')

      if (data.factors?.length === 1) {
        // Only one factor — auto-select and send OTP
        setSelectedFactor(data.factors[0].id)
        setFactors(data.factors)
        await doSendOtp(data.factors[0].id)
        setStep('otp')
      } else if (data.factors?.length > 1) {
        setFactors(data.factors)
        setStep('factor')
      } else {
        throw new Error('No OTP methods available')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function doSendOtp(factorId: string) {
    const res = await fetch('/api/iec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_otp', factorId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to send OTP')
    toast.success('OTP code sent')
  }

  async function handleSelectFactor(factorId: string) {
    setSelectedFactor(factorId)
    setLoading(true)
    try {
      await doSendOtp(factorId)
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
        body: JSON.stringify({ action: 'verify_otp', otpCode, factorId: selectedFactor, propertyId }),
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
    <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DrawerTrigger asChild>
        <Button size="sm" className={reconnect ? 'h-7 gap-1 text-xs' : 'h-8 gap-1.5 text-xs'} variant={reconnect ? 'ghost' : 'outline'}>
          <Zap className="h-3 w-3" />
          {reconnect ? 'Re-auth' : 'Connect IEC'}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Connect to Israel Electric</DrawerTitle>
          <DrawerDescription>Sign in with your IEC account (ת.ז. or passport).</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 p-4">
          {step === 'id' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">ID Number (ת.ז. or Passport)</Label>
              <Input
                type="text" placeholder="ID or passport number"
                value={idNumber} onChange={e => setIdNumber(e.target.value)}
                className="h-11 font-mono text-center text-lg tracking-widest"
                maxLength={20}
              />
              <p className="text-[10px] text-muted-foreground">
                Enter the ID you use to log in on the IEC website.
              </p>
            </div>
          )}

          {step === 'factor' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Choose where to receive your verification code:</p>
              {factors.map(f => (
                <button
                  key={f.id}
                  onClick={() => handleSelectFactor(f.id)}
                  disabled={loading}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{f.type === 'email' ? 'Email' : f.type}</p>
                    {f.email && <p className="text-xs text-muted-foreground">{f.email}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'otp' && (
            <>
              <div className="rounded-[10px] bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Code sent to {factors.find(f => f.id === selectedFactor)?.email || 'your account'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Verification Code</Label>
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
            <Button onClick={handleLogin} disabled={loading || idNumber.length < 5} className="h-11 w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting...</> : 'Continue'}
            </Button>
          )}
          {step === 'factor' && loading && (
            <Button disabled className="h-11 w-full">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending code...
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
