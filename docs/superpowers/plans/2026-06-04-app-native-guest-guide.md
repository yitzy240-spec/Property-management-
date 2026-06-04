# App-Native Guest Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app magic link the single source of truth for the live entry code, embed the Canva guide inline as a browsable viewer, relabel the entry video, and remove the dead Canva OAuth/MCP code.

**Architecture:** The guest page (server component) derives a Canva `/view?embed` URL from the stored sharing link and passes it to the guest view (client component), which renders it in a responsive iframe with an "open in Canva" fallback. The entry code stays live from the DB. All Canva OAuth/MCP/token code (which cannot authenticate from our domain) is deleted; `/codes` keeps its DB bulk-update.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, Tailwind, vitest + @testing-library/react.

**Spec:** [docs/superpowers/specs/2026-06-04-app-native-guest-guide-design.md](../specs/2026-06-04-app-native-guest-guide-design.md)

---

## File Structure

**Phase 1 — Feature (embed + relabel):**
- `src/lib/canva.ts` — add `getCanvaEmbedUrl()` (pure helper).
- `src/lib/canva.test.ts` — add `getCanvaEmbedUrl` tests.
- `src/components/features/guest-check-in.tsx` — embed iframe, relabel video, lighten code instruction.
- `src/components/features/guest-check-in.test.tsx` — new component test.
- `src/app/guest/[token]/page.tsx` — compute + pass `canvaEmbedUrl` prop.

**Phase 2 — Cleanup (remove dead Canva OAuth/MCP):**
- `src/app/api/codes/update/route.ts`, `src/components/features/code-update-form.tsx`, `src/app/(admin)/codes/page.tsx` — strip Canva, keep DB update.
- Delete: `src/app/api/auth/canva/route.ts`, `src/app/api/auth/canva/callback/route.ts`, `src/components/features/canva-connect.tsx`, `src/components/features/canva-status-toast.tsx`, `src/app/api/__tests__/canva-callback.test.ts`, `src/lib/canva-tokens.test.ts`.
- `src/app/(admin)/settings/page.tsx` — remove Canva section.
- `src/lib/canva.ts` — strip to `parseCanvaDesignId` + `getCanvaEmbedUrl`.
- `src/lib/canva.test.ts` — trim to the two pure helpers.
- `.env.example` — remove Canva/Anthropic vars.

**Phase 3 — Verify.**

> ⚠️ Each task ends compiling and test-green. Do Phase 1 before Phase 2 so the embed feature lands independently of the cleanup.

---

## Phase 1 — Feature

### Task 1: `getCanvaEmbedUrl` helper

**Files:**
- Modify: `src/lib/canva.ts` (add a function after `parseCanvaDesignId`)
- Test: `src/lib/canva.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/lib/canva.test.ts`, add `getCanvaEmbedUrl` to the existing import from `./canva`, then append:

```ts
describe('getCanvaEmbedUrl', () => {
  it('builds the embed URL from a sharing link', () => {
    expect(getCanvaEmbedUrl('https://www.canva.com/design/DAGmTDKfFrI/abc/view'))
      .toBe('https://www.canva.com/design/DAGmTDKfFrI/view?embed')
  })
  it('returns null for non-Canva or empty input', () => {
    expect(getCanvaEmbedUrl(null)).toBeNull()
    expect(getCanvaEmbedUrl('https://example.com/x')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/canva.test.ts`
Expected: FAIL — `getCanvaEmbedUrl is not a function` / import error.

- [ ] **Step 3: Implement**

In `src/lib/canva.ts`, immediately after the `parseCanvaDesignId` function, add:

```ts
/** Build the public embed-viewer URL for a Canva design from its sharing link. */
export function getCanvaEmbedUrl(url: string | null): string | null {
  const id = parseCanvaDesignId(url)
  return id ? `https://www.canva.com/design/${id}/view?embed` : null
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/canva.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canva.ts src/lib/canva.test.ts
git commit -m "feat(canva): add getCanvaEmbedUrl helper for in-app guide embed"
```

---

### Task 2: Embed the guide + relabel video in the guest view

**Files:**
- Create: `src/components/features/guest-check-in.test.tsx`
- Modify: `src/components/features/guest-check-in.tsx`
- Modify: `src/app/guest/[token]/page.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/components/features/guest-check-in.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuestCheckIn } from './guest-check-in'

const baseProperty = {
  name: 'Agripas 8',
  address: '8 Agripas',
  neighborhood: 'Center',
  city: 'Jerusalem',
  entry_code: '1234',
  building_entry_code: '8889',
  youtube_tutorial_url: 'https://youtu.be/abc',
  canva_design_url: 'https://www.canva.com/design/DAGmTDKfFrI/view',
}

describe('GuestCheckIn', () => {
  it('embeds the Canva guide via an iframe when canvaEmbedUrl is provided', () => {
    render(
      <GuestCheckIn
        property={baseProperty}
        booking={null}
        canvaEmbedUrl="https://www.canva.com/design/DAGmTDKfFrI/view?embed"
      />,
    )
    const iframe = screen.getByTitle('Agripas 8 Guide')
    expect(iframe.getAttribute('src')).toBe('https://www.canva.com/design/DAGmTDKfFrI/view?embed')
  })

  it('labels the video as the entry video, not "Apartment Video Guide"', () => {
    render(<GuestCheckIn property={baseProperty} booking={null} canvaEmbedUrl={null} />)
    expect(screen.getByText('Entry Video Guide')).toBeTruthy()
    expect(screen.queryByText('Apartment Video Guide')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/features/guest-check-in.test.tsx`
Expected: FAIL — no iframe titled "Agripas 8 Guide" (still a link card); "Apartment Video Guide" still present; `canvaEmbedUrl` prop not accepted.

- [ ] **Step 3a: Add the `canvaEmbedUrl` prop**

In `src/components/features/guest-check-in.tsx`, in the `GuestCheckInProps` interface, after the `guideText?: string | null` line add:

```ts
  canvaEmbedUrl?: string | null
```

And change the function signature from:

```tsx
export function GuestCheckIn({ property, booking, guideText }: GuestCheckInProps) {
```

to:

```tsx
export function GuestCheckIn({ property, booking, guideText, canvaEmbedUrl }: GuestCheckInProps) {
```

- [ ] **Step 3b: Replace the Canva link card with an embedded viewer**

Replace this entire block:

```tsx
        {/* Apartment guide (Canva design link). The field stores a sharing
            URL, not an image — render as a tappable card matching the
            Video Guide pattern below so it opens in a new tab. */}
        {property.canva_design_url && (
          <a
            href={property.canva_design_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <div className="flex items-center gap-4 rounded-[10px] border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[hsl(var(--accent)/0.12)]">
                <BookOpen className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold">{property.name} Guide</p>
                <p className="text-xs text-muted-foreground">
                  Wifi, appliances, neighborhood tips
                </p>
              </div>
            </div>
          </a>
        )}
```

with:

```tsx
        {/* Apartment guide — embedded Canva viewer (browsable inline). The
            published design renders live, so the host's Canva edits appear
            automatically. Fallback link opens the full guide in a new tab. */}
        {canvaEmbedUrl && (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <BookOpen className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold">{property.name} Guide</p>
            </div>
            <div className="relative w-full" style={{ height: '70vh', minHeight: 480 }}>
              <iframe
                src={canvaEmbedUrl}
                title={`${property.name} Guide`}
                loading="lazy"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
                style={{ border: 0 }}
              />
            </div>
            {property.canva_design_url && (
              <a
                href={property.canva_design_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-accent hover:underline"
              >
                Open full guide in Canva ↗
              </a>
            )}
          </div>
        )}
```

- [ ] **Step 3c: Lighten the code instruction line**

Replace:

```tsx
              <p className="mt-3 text-xs text-muted-foreground">
                {property.building_entry_code
                  ? 'Use the building code at the main entrance, then the apartment code on the Simplex lock.'
                  : 'Use this code on the Simplex lock at the front door.'}
              </p>
```

with:

```tsx
              <p className="mt-3 text-xs text-muted-foreground">
                Step-by-step entry instructions are in your guide below.
              </p>
```

- [ ] **Step 3d: Relabel the video card**

Replace:

```tsx
                <p className="text-sm font-semibold">Apartment Video Guide</p>
                <p className="text-xs text-muted-foreground">
                  Watch how to enter and use the apartment
                </p>
```

with:

```tsx
                <p className="text-sm font-semibold">Entry Video Guide</p>
                <p className="text-xs text-muted-foreground">
                  Watch how to get in — step-by-step
                </p>
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/components/features/guest-check-in.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Wire the prop in the guest page**

In `src/app/guest/[token]/page.tsx`, add to the imports:

```tsx
import { getCanvaEmbedUrl } from '@/lib/canva'
```

Then change the render from:

```tsx
    return (
      <GuestCheckIn
        property={{ ...property, entry_code: entryCode, building_entry_code: buildingEntryCode }}
        booking={booking}
        guideText={guideText}
      />
    )
```

to:

```tsx
    return (
      <GuestCheckIn
        property={{ ...property, entry_code: entryCode, building_entry_code: buildingEntryCode }}
        booking={booking}
        guideText={guideText}
        canvaEmbedUrl={getCanvaEmbedUrl(property.canva_design_url)}
      />
    )
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add src/components/features/guest-check-in.tsx src/components/features/guest-check-in.test.tsx "src/app/guest/[token]/page.tsx"
git commit -m "feat(guest): embed Canva guide inline + relabel entry video"
```

---

## Phase 2 — Cleanup (remove dead Canva OAuth/MCP)

### Task 3: Strip Canva from `/codes` (keep DB bulk-update)

**Files:**
- Modify: `src/app/api/codes/update/route.ts`
- Modify: `src/components/features/code-update-form.tsx`
- Modify: `src/app/(admin)/codes/page.tsx`

- [ ] **Step 1: Replace `src/app/api/codes/update/route.ts` with:**

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

export const maxDuration = 60
const MAX_PROPERTIES_PER_JOB = 20

export async function POST(request: Request) {
  let user
  try {
    user = await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    apartment_code?: string
    building_code?: string
    property_ids: string[]
  }

  if (!body.property_ids?.length) {
    return NextResponse.json({ error: 'property_ids required' }, { status: 400 })
  }
  if (body.property_ids.length > MAX_PROPERTIES_PER_JOB) {
    return NextResponse.json(
      { error: `Up to ${MAX_PROPERTIES_PER_JOB} properties per job. Split into multiple runs.` },
      { status: 400 },
    )
  }
  if (!body.apartment_code && !body.building_code) {
    return NextResponse.json({ error: 'apartment_code or building_code required' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: job, error: jobErr } = await service
    .from('code_update_jobs')
    .insert({
      created_by: user.id,
      apartment_code: body.apartment_code ?? null,
      building_code: body.building_code ?? null,
      property_ids: body.property_ids,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? 'failed to create job' }, { status: 500 })
  }

  try {
    await processJob(job.id, body)
  } catch {
    // Errors are already persisted into the job row's results.
  }

  return NextResponse.json({ job_id: job.id })
}

async function processJob(
  jobId: string,
  input: { apartment_code?: string; building_code?: string; property_ids: string[] },
) {
  const service = createServiceClient()
  const results: Record<string, { db: string; message: string }> = {}

  for (const propertyId of input.property_ids) {
    const result = { db: 'failed', message: '' }

    const updates: Record<string, string> = {}
    if (input.apartment_code) updates.entry_code = input.apartment_code
    if (input.building_code) updates.building_entry_code = input.building_code

    const { error: updateErr } = await service
      .from('properties')
      .update(updates)
      .eq('id', propertyId)
      .select('name')
      .single()

    if (updateErr) {
      result.message = updateErr.message
    } else {
      result.db = 'ok'
    }

    results[propertyId] = result
    await persistResults(jobId, results)
  }

  await service
    .from('code_update_jobs')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

async function persistResults(jobId: string, results: Record<string, unknown>) {
  const service = createServiceClient()
  await service.from('code_update_jobs').update({ results }).eq('id', jobId)
}
```

> Note: `code_update_jobs.update_canva` is `NOT NULL DEFAULT true`; omitting it on insert uses the default, so no migration is needed.

- [ ] **Step 2: Replace `src/components/features/code-update-form.tsx` with:**

```tsx
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
```

- [ ] **Step 3: Replace `src/app/(admin)/codes/page.tsx` with:**

```tsx
export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { CodeUpdateForm } from '@/components/features/code-update-form'

export default async function CodesPage() {
  const service = createServiceClient()
  const { data: properties } = await service
    .from('properties')
    .select('id, name, entry_code, building_entry_code')
    .order('name')

  const enriched = (properties ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    entry_code: p.entry_code,
    building_entry_code: p.building_entry_code,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Update Codes</h1>
        <p className="text-xs text-muted-foreground">
          Change apartment or building entry codes.
        </p>
      </div>
      <CodeUpdateForm properties={enriched} />
    </div>
  )
}
```

- [ ] **Step 4: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: exit 0. (`canva.ts` still has the OAuth/MCP exports; they're simply no longer imported here — that's fine until Task 5.)

```bash
git add src/app/api/codes/update/route.ts src/components/features/code-update-form.tsx "src/app/(admin)/codes/page.tsx"
git commit -m "refactor(codes): drop Canva push, keep DB bulk code-update"
```

---

### Task 4: Delete the OAuth routes, connect UI, and clean Settings

**Files:**
- Delete: `src/app/api/auth/canva/route.ts`, `src/app/api/auth/canva/callback/route.ts`, `src/components/features/canva-connect.tsx`, `src/components/features/canva-status-toast.tsx`, `src/app/api/__tests__/canva-callback.test.ts`
- Modify: `src/app/(admin)/settings/page.tsx`

- [ ] **Step 1: Delete the dead files**

```bash
git rm src/app/api/auth/canva/route.ts \
       src/app/api/auth/canva/callback/route.ts \
       src/components/features/canva-connect.tsx \
       src/components/features/canva-status-toast.tsx \
       src/app/api/__tests__/canva-callback.test.ts
```

- [ ] **Step 2: Remove Canva from `src/app/(admin)/settings/page.tsx`**

Remove these three import lines:

```tsx
import { CanvaConnect } from '@/components/features/canva-connect'
import { CanvaStatusToast } from '@/components/features/canva-status-toast'
import { loadCanvaTokens } from '@/lib/canva'
```

Remove this block:

```tsx
  let canvaConnected = false
  try {
    canvaConnected = !!(await loadCanvaTokens())
  } catch {
    canvaConnected = false
  }
```

Remove the toast Suspense block:

```tsx
      <Suspense fallback={null}>
        <CanvaStatusToast />
      </Suspense>
```

Remove the entire Canva section:

```tsx
      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Canva Integration
        </p>
        <CanvaConnect connected={canvaConnected} />
      </section>
```

> Keep the `Suspense` import — it's still used by `GmailConnect`.

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add "src/app/(admin)/settings/page.tsx"
git commit -m "refactor(canva): remove OAuth routes + Settings connect UI (cannot auth from our domain)"
```

---

### Task 5: Strip `canva.ts` to the two pure helpers + trim its test

**Files:**
- Modify: `src/lib/canva.ts`
- Modify: `src/lib/canva.test.ts`
- Delete: `src/lib/canva-tokens.test.ts`

- [ ] **Step 1: Replace `src/lib/canva.ts` with:**

```ts
/** Extract the Canva design ID from a design sharing URL. */
export function parseCanvaDesignId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)/)
  return match?.[1] ?? null
}

/** Build the public embed-viewer URL for a Canva design from its sharing link. */
export function getCanvaEmbedUrl(url: string | null): string | null {
  const id = parseCanvaDesignId(url)
  return id ? `https://www.canva.com/design/${id}/view?embed` : null
}
```

- [ ] **Step 2: Replace `src/lib/canva.test.ts` with:**

```ts
import { describe, it, expect } from 'vitest'
import { parseCanvaDesignId, getCanvaEmbedUrl } from './canva'

describe('parseCanvaDesignId', () => {
  it('extracts ID from a standard Canva URL', () => {
    expect(parseCanvaDesignId('https://www.canva.com/design/DAGmTDKfFrI/abc/view')).toBe('DAGmTDKfFrI')
  })
  it('handles URLs without www', () => {
    expect(parseCanvaDesignId('https://canva.com/design/DAHCHqRRpzI/edit')).toBe('DAHCHqRRpzI')
  })
  it('returns null for non-Canva URLs', () => {
    expect(parseCanvaDesignId('https://example.com/design/foo')).toBeNull()
  })
  it('returns null for empty/null input', () => {
    expect(parseCanvaDesignId('')).toBeNull()
    expect(parseCanvaDesignId(null)).toBeNull()
  })
})

describe('getCanvaEmbedUrl', () => {
  it('builds the embed URL from a sharing link', () => {
    expect(getCanvaEmbedUrl('https://www.canva.com/design/DAGmTDKfFrI/abc/view'))
      .toBe('https://www.canva.com/design/DAGmTDKfFrI/view?embed')
  })
  it('returns null for non-Canva or empty input', () => {
    expect(getCanvaEmbedUrl(null)).toBeNull()
    expect(getCanvaEmbedUrl('https://example.com/x')).toBeNull()
  })
})
```

- [ ] **Step 3: Delete the token test**

```bash
git rm src/lib/canva-tokens.test.ts
```

- [ ] **Step 4: Verify the suite + types**

Run: `npx vitest run`
Expected: PASS, no failures, no references to deleted Canva functions.
Run: `npx tsc --noEmit`
Expected: exit 0.

> If `tsc` reports any remaining importer of a removed export (`exchangeCodeForTokens`, `storeCanvaTokens`, `loadCanvaTokens`, `clearCanvaTokens`, `refreshCanvaTokensIfNeeded`, `getCanvaAuthorizeUrl`, `generatePkcePair`, `updateCanvaDesignCodes`, `CanvaTokens`), open that file and remove the usage — there should be none after Tasks 3–4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canva.ts src/lib/canva.test.ts
git commit -m "refactor(canva): reduce lib to parseCanvaDesignId + getCanvaEmbedUrl"
```

---

### Task 6: Remove unused env vars

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Find and remove Canva/Anthropic env lines**

Run: `grep -niE "canva|anthropic" .env.example`
For each matching line (e.g. `CANVA_CLIENT_ID=`, `CANVA_CLIENT_SECRET=`, `ANTHROPIC_API_KEY=` and any preceding comment), delete it from `.env.example`. If `grep` returns nothing, skip.

> Do **not** remove `ANTHROPIC_API_KEY` if another file still imports `@anthropic-ai/sdk` or reads `process.env.ANTHROPIC_API_KEY`. Confirm with: `grep -rIn "ANTHROPIC_API_KEY\|@anthropic-ai/sdk" src/` — if there are no hits, removing it is safe.

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: drop unused Canva/Anthropic env vars from example"
```

---

## Phase 3 — Verify

### Task 7: Full verification + manual checklist

- [ ] **Step 1: Full suite + type-check**

Run: `npx vitest run`
Expected: all tests pass.
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Manual embed verification (build-time check from the spec)**

Against one real, link-view-enabled design (e.g. Agripas 8) on a **phone-sized viewport**:
- The guide renders inline in the iframe and is scrollable/browsable.
- "Open full guide in Canva ↗" opens the design in a new tab.
- The live code card shows above it; the video card reads "Entry Video Guide".

If the `/view?embed` URL does not render for the stored share-link format, capture the actual embed URL from Canva (Share → More → Embed) and adjust `getCanvaEmbedUrl` accordingly, updating its test.

- [ ] **Step 3: Operational cleanup (manual — outside this repo, for Yitzy)**

These cannot be done from code; list them for the operator:
- Vercel → remove env vars `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, and `ANTHROPIC_API_KEY` (if no remaining consumer).
- Supabase → delete the `canva_access_token`, `canva_refresh_token`, `canva_token_expires_at` rows from `app_settings`.
- **Rotate the Anthropic API key** that was exposed earlier in chat.
- In Canva (Ariel): set each guide design to **"anyone with the link can view"**, **remove the printed code line**, and make the **entry instructions the first page**.

---

## Self-Review

- **Spec coverage:** embed (Task 2) ✓; live code unchanged (untouched) ✓; relabel video (Task 2) ✓; lighten code instruction (Task 2) ✓; remove dead OAuth/MCP (Tasks 3–5) ✓; keep `/codes` DB update + `parseCanvaDesignId` (Task 3, Task 5) ✓; env cleanup + manual ops + key rotation (Tasks 6–7) ✓; reveal/expiry untouched (kept as-is per Ariel) ✓; build-time embed verification (Task 7) ✓.
- **Placeholder scan:** none — every code step shows full code; deletions are explicit `git rm`.
- **Type consistency:** `getCanvaEmbedUrl(url: string | null): string | null` defined in Task 1, consumed in Task 2 (page) and final form in Task 5; `canvaEmbedUrl?: string | null` prop matches the page call; `code_update_jobs` results type narrowed to `{ db, message }` consistently across route + form.
