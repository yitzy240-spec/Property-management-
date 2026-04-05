'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

interface ReportGenerateButtonProps {
  owners: { id: string; full_name: string }[]
  defaultQuarter: number
  defaultYear: number
}

export function ReportGenerateButton({ owners, defaultQuarter, defaultYear }: ReportGenerateButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [ownerId, setOwnerId] = useState('')
  const [quarter, setQuarter] = useState(String(defaultQuarter))
  const [year, setYear] = useState(String(defaultYear))
  const [generating, setGenerating] = useState(false)

  async function handleGenerate() {
    if (!ownerId) { toast.error('Select an owner'); return }
    setGenerating(true)

    try {
      const res = await fetch('/api/ai/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: ownerId,
          quarter: Number(quarter),
          year: Number(year),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success('Report generated')
      setOpen(false)
      router.push(`/reports/${data.report_id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
          <Sparkles className="h-3.5 w-3.5" />
          Generate
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Generate Quarterly Report</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner</label>
            <Select value={ownerId} onValueChange={(v) => setOwnerId(v || '')}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quarter</label>
              <Select value={quarter} onValueChange={(v) => setQuarter(v || '1')}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1 (Jan–Mar)</SelectItem>
                  <SelectItem value="2">Q2 (Apr–Jun)</SelectItem>
                  <SelectItem value="3">Q3 (Jul–Sep)</SelectItem>
                  <SelectItem value="4">Q4 (Oct–Dec)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year</label>
              <Select value={year} onValueChange={(v) => setYear(v || String(defaultYear))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(defaultYear - 1)}>{defaultYear - 1}</SelectItem>
                  <SelectItem value={String(defaultYear)}>{defaultYear}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {generating ? 'Generating with AI...' : 'Generate Report'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
