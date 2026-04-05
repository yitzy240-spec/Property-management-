'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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

interface InvoicePushButtonProps {
  billingMonth: string  // e.g. "2026-04-01"
  unpushedCount: number
}

export function InvoicePushButton({ billingMonth, unpushedCount }: InvoicePushButtonProps) {
  const router = useRouter()
  const [pushing, setPushing] = useState(false)

  async function handlePush() {
    setPushing(true)
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing_month: billingMonth }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate invoices')
      }

      toast.success(data.message)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to push invoices')
    } finally {
      setPushing(false)
    }
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
          <FileText className="h-3.5 w-3.5" />
          Invoice ({unpushedCount})
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Generate Invoices</DrawerTitle>
          <DrawerDescription>
            Push {unpushedCount} fee {unpushedCount === 1 ? 'entry' : 'entries'} to Green Invoice.
            One invoice per owner will be created.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button
            onClick={handlePush}
            disabled={pushing}
            className="h-11 w-full"
          >
            {pushing ? 'Generating...' : 'Generate & Send Invoices'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
