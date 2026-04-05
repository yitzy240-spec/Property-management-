'use client'

import { useState } from 'react'
import { Sparkles, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

interface Forecast {
  property_name: string
  urgency: 'ok' | 'soon' | 'urgent'
  recommended_laundry_date: string
  reason: string
}

export function LinenForecast() {
  const [forecasts, setForecasts] = useState<Forecast[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadForecast() {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/linen-forecast')
      if (res.ok) {
        const data = await res.json()
        setForecasts(data.forecasts)
      }
    } catch { /* silently fail */ }
    setLoading(false)
  }

  if (forecasts === null) {
    return (
      <div className="rounded-[10px] border border-dashed border-border bg-muted/30 p-4 text-center">
        <Button variant="outline" size="sm" onClick={loadForecast} disabled={loading} className="gap-1.5">
          <Sparkles className={`h-3.5 w-3.5 ${loading ? 'animate-pulse text-accent' : ''}`} />
          {loading ? 'Analyzing...' : 'AI Linen Forecast'}
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Predicts which properties need laundry runs this week
        </p>
      </div>
    )
  }

  if (forecasts.length === 0) {
    return (
      <div className="rounded-[10px] border border-status-safe/30 bg-[hsl(152_54%_25%/0.04)] p-4 text-center">
        <p className="text-sm font-medium text-status-safe">All properties are well-stocked</p>
        <p className="mt-1 text-xs text-muted-foreground">No laundry runs needed this week</p>
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-status-warning/30 bg-[hsl(38_92%_50%/0.04)] p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <p className="text-xs font-semibold text-foreground">AI Linen Forecast</p>
      </div>
      <div className="space-y-2">
        {forecasts.map((f, i) => (
          <div key={i} className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                {f.urgency === 'urgent' && <AlertTriangle className="h-3 w-3 text-status-danger" />}
                <span className="text-sm font-medium">{f.property_name}</span>
                <StatusBadge
                  status={f.urgency === 'urgent' ? 'danger' : 'warning'}
                  label={f.urgency}
                  size="sm"
                />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.reason}</p>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              by {f.recommended_laundry_date}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
