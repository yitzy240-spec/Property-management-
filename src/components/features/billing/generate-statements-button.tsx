'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calculator } from 'lucide-react'
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

interface GenerateStatementsButtonProps {
  billingMonth: string
}

export function GenerateStatementsButton({ billingMonth }: GenerateStatementsButtonProps) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)

  const monthLabel = new Date(billingMonth + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/statements/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing_month: billingMonth }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate statements')
      }

      if (data.statements?.length > 0) {
        toast.success(`Generated ${data.statements.length} statement(s)`)
      } else {
        toast.info(data.message || 'No billable activity found')
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate statements')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
          <Calculator className="h-3.5 w-3.5" />
          Generate
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Generate Monthly Statements</DrawerTitle>
          <DrawerDescription>
            Calculate billing for <strong>{monthLabel}</strong>. This will create a statement for
            each owner with rental income, management fees, hourly charges, and expenses.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="h-11 w-full"
          >
            {generating ? 'Calculating...' : `Generate Statements for ${monthLabel}`}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
