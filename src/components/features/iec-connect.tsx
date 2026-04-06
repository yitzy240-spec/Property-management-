'use client'

import { useState } from 'react'
import { Zap, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface IecConnectProps {
  propertyId: string
  propertyName: string
  isConnected?: boolean
}

export function IecConnect({ propertyId, propertyName, isConnected }: IecConnectProps) {
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
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP')
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

      toast.success(`Connected! Found ${data.contracts?.length || 0} contracts`)
      setStep('done')

      // Trigger initial sync
      fetch('/api/iec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      }).then(r => r.json()).then(syncData => {
        if (syncData.synced > 0) {
          toast.success(`Synced ${syncData.synced} IEC bills`)
        }
      }).catch(() => {})

    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-status-safe">
        <Zap className="h-3 w-3" />
        IEC Connected
      </div>
    )
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setStep('id'); setOtpCode(''); } }}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[10px]">
          <Zap className="h-3 w-3" />
          Connect IEC
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Connect to Israel Electric</DrawerTitle>
          <DrawerDescription>
            Link {propertyName} to IEC for automatic bill sync + PDF download.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 p-4">
          {step === 'id' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Israeli ID (ת.ז.)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456789"
                  value={israeliId}
                  onChange={e => setIsraeliId(e.target.value)}
                  className="h-11 font-mono text-center text-lg tracking-widest"
                  maxLength={9}
                />
                <p className="text-[10px] text-muted-foreground">
                  The ID number registered with this electricity account. IEC will send an OTP to the phone on file.
                </p>
              </div>
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="rounded-[10px] bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">OTP sent to the phone registered with IEC</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Enter OTP Code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value)}
                  className="h-11 font-mono text-center text-2xl tracking-[0.3em]"
                  maxLength={6}
                />
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(152_54%_25%/0.1)]">
                <Check className="h-6 w-6 text-status-safe" />
              </div>
              <p className="text-sm font-medium">IEC Connected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bills will sync automatically. Check the Bills page for new entries.
              </p>
            </div>
          )}
        </div>

        <DrawerFooter>
          {step === 'id' && (
            <Button onClick={handleSendOtp} disabled={loading || israeliId.length < 7} className="h-11 w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending OTP...</> : 'Send OTP Code'}
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
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
