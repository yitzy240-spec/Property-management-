'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MonthSelectorProps {
  currentMonth: string // 'YYYY-MM-01'
}

export function MonthSelector({ currentMonth }: MonthSelectorProps) {
  const router = useRouter()

  function navigate(offset: number) {
    const d = new Date(currentMonth + 'T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + offset)
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
    router.push(`/billing?month=${month}`)
  }

  const label = new Date(currentMonth + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[80px] text-center text-xs font-medium">{label}</span>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
