'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface PropertyOption {
  id: string
  name: string
  entry_code: string | null
  building_entry_code: string | null
}

interface JobResult {
  status: 'running' | 'done'
  results: Record<string, { db: string; message: string }>
}

interface CodeUpdateFormProps {
  properties: PropertyOption[]
}

export function CodeUpdateForm({ properties }: CodeUpdateFormProps) {
  const [apartmentCode, setApartmentCode] = useState('')
  const [buildingCode, setBuildingCode] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobResult | null>(null)

  const canSubmit = (apartmentCode.trim() || buildingCode.trim()) && selected.size > 0 && !jobId

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    try {
      const res = await fetch('/api/codes/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apartment_code: apartmentCode.trim() || undefined,
          building_code: buildingCode.trim() || undefined,
          property_ids: Array.from(selected),
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to start update')
      }
      const { job_id } = (await res.json()) as { job_id: string }
      setJobId(job_id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    async function poll() {
      while (!cancelled) {
        const res = await fetch(`/api/codes/jobs/${jobId}`)
        if (res.ok) {
          const data = (await res.json()) as JobResult
          setJob(data)
          if (data.status === 'done') return
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [jobId])

  function reset() {
    setApartmentCode('')
    setBuildingCode('')
    setSelected(new Set())
    setJobId(null)
    setJob(null)
  }

  const counts = { done: 0, failed: 0 }
  if (job) {
    for (const r of Object.values(job.results)) {
      if (r.db === 'ok') counts.done++
      else counts.failed++
    }
  }

  return (
    <div className="space-y-4">
      {!jobId ? (
        <>
          <section className="rounded-[10px] border border-border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New codes</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Apartment code
                <input
                  value={apartmentCode}
                  onChange={(e) => setApartmentCode(e.target.value)}
                  placeholder="e.g. 4827"
                  className="mt-1 h-9 w-full rounded-[6px] border border-border bg-background px-2 font-mono text-sm"
                />
              </label>
              <label className="text-sm">
                Building code <span className="text-muted-foreground">(optional)</span>
                <input
                  value={buildingCode}
                  onChange={(e) => setBuildingCode(e.target.value)}
                  placeholder="e.g. #9999"
                  className="mt-1 h-9 w-full rounded-[6px] border border-border bg-background px-2 font-mono text-sm"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[10px] border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Apartments</p>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setSelected(new Set(properties.map((p) => p.id)))} className="text-muted-foreground hover:text-foreground">
                  All
                </button>
                <span className="text-muted-foreground">·</span>
                <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {properties.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Current: {p.entry_code ?? '—'}
                      {p.building_entry_code && <> · Building: {p.building_entry_code}</>}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <Button className="h-11 w-full" disabled={!canSubmit} onClick={submit}>
            Update {selected.size} apartment{selected.size === 1 ? '' : 's'}
          </Button>
        </>
      ) : (
        <>
          <section className="rounded-[10px] border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {job?.status === 'done' ? 'Complete' : 'Updating...'}
            </p>
            <div className="mt-3 flex gap-6 text-sm">
              <div>
                <span className="font-semibold text-green-600">{counts.done}</span> done
              </div>
              <div>
                <span className="font-semibold text-red-600">{counts.failed}</span> failed
              </div>
              <div>
                <span className="text-muted-foreground">{Array.from(selected).length - counts.done - counts.failed}</span> remaining
              </div>
            </div>
          </section>

          <section className="rounded-[10px] border border-border p-4 space-y-2">
            {Array.from(selected).map((id) => {
              const property = properties.find((p) => p.id === id)!
              const r = job?.results[id]
              return (
                <div key={id} className="flex items-center gap-3 border-b border-border/50 py-2 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{property.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r?.message || (r ? `DB ${r.db}` : 'Queued...')}
                    </p>
                  </div>
                  <StatusPill r={r} />
                </div>
              )
            })}
          </section>

          {job?.status === 'done' && (
            <Button onClick={reset} className="w-full">
              Start new update
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function StatusPill({ r }: { r: { db: string; message: string } | undefined }) {
  if (!r) return <span className="text-[11px] text-muted-foreground">Queued</span>
  if (r.db === 'failed') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">Failed</span>
  if (r.db === 'ok') return <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Done</span>
  return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Updating...</span>
}
