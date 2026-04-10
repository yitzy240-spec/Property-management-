'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
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
            <NativeSelect
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value || '')}
              placeholder="Select owner"
              className="h-11"
              options={owners.map(o => ({ value: o.id, label: o.full_name }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quarter</label>
              <NativeSelect
                value={quarter}
                onChange={(e) => setQuarter(e.target.value || '1')}
                className="h-11"
                options={[
                  { value: '1', label: 'Q1 (Jan\u2013Mar)' },
                  { value: '2', label: 'Q2 (Apr\u2013Jun)' },
                  { value: '3', label: 'Q3 (Jul\u2013Sep)' },
                  { value: '4', label: 'Q4 (Oct\u2013Dec)' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year</label>
              <NativeSelect
                value={year}
                onChange={(e) => setYear(e.target.value || String(defaultYear))}
                className="h-11"
                options={[
                  { value: String(defaultYear - 1), label: String(defaultYear - 1) },
                  { value: String(defaultYear), label: String(defaultYear) },
                ]}
              />
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
