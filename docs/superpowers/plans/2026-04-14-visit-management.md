# Visit Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visit tracking system where admin logs routine property inspections on a 2-week cycle, with owner-visible visit reports and private admin notes.

**Architecture:** New `visits` and `visit_media` DB tables with RLS. Server-rendered pages following existing patterns (tasks page, work-log). Schedule computed at query time from last visit date and last checkout date. Media stored in Supabase Storage `visit-media` bucket.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Storage + RLS), TypeScript, Tailwind CSS, shadcn/ui, sonner toast

**Spec:** `docs/superpowers/specs/2026-04-14-visit-management-design.md`

---

## File Structure

### New Files
- `supabase/migrations/00023_visits.sql` — DB schema, RLS, indexes
- `src/app/(admin)/visits/page.tsx` — Main visits page (3 sections)
- `src/app/(admin)/visits/new/page.tsx` — Log visit page (full page form)
- `src/components/features/visit-list.tsx` — Compact visit list for property detail + owner portal
- `src/components/features/visit-checklist.tsx` — Checklist toggle component
- `src/components/features/visit-media-upload.tsx` — Photo/video upload with public/private toggle
- `src/lib/visits.ts` — Shared query logic (schedule computation, visit data fetching)
- `src/app/api/visits/route.ts` — POST endpoint for creating visits
- `src/app/api/visits/media/route.ts` — POST endpoint for uploading visit media

### Modified Files
- `src/types/index.ts` — Add Visit, VisitMedia types and checklist constants
- `src/components/layout/shells/ledger-shell.tsx:41-53` — Add Visits to menuItems
- `src/app/(admin)/properties/page.tsx:67-80` — Add "Last visit" badge to property cards
- `src/app/(admin)/properties/[id]/page.tsx:150-162` — Add Visits section before bookings
- `src/app/(owner)/owner/page.tsx:51-73` — Fetch visits data + add Visits section

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00023_visits.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ApartmentOS: Visit management for routine property inspections
-- Admin logs visits on a 2-week cycle, owners see completed visit reports

CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  visited_at DATE NOT NULL DEFAULT CURRENT_DATE,
  checklist JSONB NOT NULL DEFAULT '{}',
  note TEXT,                              -- public note visible to owner
  admin_note TEXT,                        -- private note, admin only
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visit_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,                -- Supabase Storage path
  file_type TEXT NOT NULL DEFAULT 'image', -- 'image' or 'video'
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_media ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admin full access on visits" ON visits FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin full access on visit_media" ON visit_media FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Owners: read visits for their properties
CREATE POLICY "Owners read own visits" ON visits FOR SELECT
  USING (
    property_id IN (
      SELECT p.id FROM properties p
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );

-- Owners: read public media for their properties
CREATE POLICY "Owners read public visit media" ON visit_media FOR SELECT
  USING (
    is_private = false
    AND visit_id IN (
      SELECT v.id FROM visits v
      JOIN properties p ON v.property_id = p.id
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_visits_property ON visits(property_id);
CREATE INDEX idx_visits_visited_at ON visits(visited_at);
CREATE INDEX idx_visit_media_visit ON visit_media(visit_id);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: Migration applied successfully, tables created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00023_visits.sql
git commit -m "feat: add visits and visit_media tables with RLS"
```

---

## Task 2: TypeScript Types and Checklist Constants

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add types and constants to `src/types/index.ts`**

Add at the end of the file:

```typescript
// ============================================
// Visits
// ============================================

export const VISIT_CHECKLIST_ITEMS = [
  { key: 'electricity_working', label: 'Electricity working' },
  { key: 'run_sinks', label: 'Run sinks' },
  { key: 'run_showers', label: 'Run showers' },
  { key: 'flush_toilets', label: 'Flush toilets' },
  { key: 'refrigerator_freezer', label: 'Refrigerator and Freezer working' },
  { key: 'soap_stock', label: 'Soap / toilet paper / etc in stock' },
  { key: 'boiler_off', label: 'Make sure boiler is off' },
  { key: 'washer_door_open', label: 'Check washer door is open' },
  { key: 'dryer_lint', label: 'Check dryer lint' },
  { key: 'bedrooms_no_mold', label: 'Bedrooms no mold or leaking on walls' },
  { key: 'check_mailbox', label: 'Check mailbox' },
] as const

export type ChecklistKey = typeof VISIT_CHECKLIST_ITEMS[number]['key']

export interface Visit {
  id: string
  property_id: string
  visited_at: string
  checklist: Partial<Record<ChecklistKey, boolean>>
  note: string | null
  admin_note: string | null
  created_by: string
  created_at: string
  properties?: { name: string }
}

export interface VisitMedia {
  id: string
  visit_id: string
  file_path: string
  file_type: 'image' | 'video'
  is_private: boolean
  created_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Visit types and checklist constants"
```

---

## Task 3: Visit Query Utilities

**Files:**
- Create: `src/lib/visits.ts`

- [ ] **Step 1: Create the shared query module**

```typescript
import { SupabaseClient } from '@supabase/supabase-js'

interface PropertyVisitStatus {
  id: string
  name: string
  neighborhood: string | null
  city: string
  owner_id: string
  last_visit_date: string | null
  last_admin_note: string | null
  next_visit_due: string
  is_occupied: boolean
  occupancy_end: string | null
  occupancy_type: 'guest' | 'owner_stay' | null
}

/**
 * Get visit schedule status for all active properties.
 * Computes next_visit_due from MAX(last_visit, last_checkout, created_at) + 14 days.
 * Determines occupancy from active bookings.
 */
export async function getPropertyVisitStatuses(
  supabase: SupabaseClient
): Promise<PropertyVisitStatus[]> {
  const today = new Date().toISOString().split('T')[0]

  // Fetch all active properties
  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, neighborhood, city, owner_id, created_at')
    .eq('is_active', true)
    .order('name')

  if (!properties || properties.length === 0) return []

  const propertyIds = properties.map(p => p.id)

  // Fetch last visit per property
  const { data: visits } = await supabase
    .from('visits')
    .select('property_id, visited_at, admin_note')
    .in('property_id', propertyIds)
    .order('visited_at', { ascending: false })

  // Fetch active bookings (check_in <= today AND check_out > today)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('property_id, check_out, platform')
    .in('property_id', propertyIds)
    .lte('check_in', today)
    .gt('check_out', today)

  // Fetch most recent completed booking per property (for resume date calc)
  const { data: recentCheckouts } = await supabase
    .from('bookings')
    .select('property_id, check_out')
    .in('property_id', propertyIds)
    .lte('check_out', today)
    .order('check_out', { ascending: false })

  // Build lookup maps
  const lastVisitMap = new Map<string, { date: string; admin_note: string | null }>()
  for (const v of visits ?? []) {
    if (!lastVisitMap.has(v.property_id)) {
      lastVisitMap.set(v.property_id, { date: v.visited_at, admin_note: v.admin_note })
    }
  }

  const activeBookingMap = new Map<string, { check_out: string; type: 'guest' | 'owner_stay' }>()
  for (const b of bookings ?? []) {
    if (!activeBookingMap.has(b.property_id)) {
      const isOwnerStay = b.platform === 'owner_stay'
      activeBookingMap.set(b.property_id, {
        check_out: b.check_out,
        type: isOwnerStay ? 'owner_stay' : 'guest',
      })
    }
  }

  const lastCheckoutMap = new Map<string, string>()
  for (const b of recentCheckouts ?? []) {
    if (!lastCheckoutMap.has(b.property_id)) {
      lastCheckoutMap.set(b.property_id, b.check_out)
    }
  }

  return properties.map(p => {
    const lastVisit = lastVisitMap.get(p.id)
    const activeBooking = activeBookingMap.get(p.id)
    const lastCheckout = lastCheckoutMap.get(p.id)

    // next_visit_due = GREATEST(last_visit, last_checkout, created_at) + 14 days
    const candidates = [p.created_at.split('T')[0]]
    if (lastVisit) candidates.push(lastVisit.date)
    if (lastCheckout) candidates.push(lastCheckout)

    const baseDate = candidates.sort().pop()! // latest date
    const due = new Date(baseDate)
    due.setDate(due.getDate() + 14)

    return {
      id: p.id,
      name: p.name,
      neighborhood: p.neighborhood,
      city: p.city,
      owner_id: p.owner_id,
      last_visit_date: lastVisit?.date ?? null,
      last_admin_note: lastVisit?.admin_note ?? null,
      next_visit_due: due.toISOString().split('T')[0],
      is_occupied: !!activeBooking,
      occupancy_end: activeBooking?.check_out ?? null,
      occupancy_type: activeBooking?.type ?? null,
    }
  })
}

/**
 * Fetch recent visits for a property (for property detail page).
 */
export async function getPropertyVisits(
  supabase: SupabaseClient,
  propertyId: string,
  limit = 5
) {
  const { data } = await supabase
    .from('visits')
    .select('*')
    .eq('property_id', propertyId)
    .order('visited_at', { ascending: false })
    .limit(limit)

  return data ?? []
}

/**
 * Fetch visits for owner's properties (public data only).
 */
export async function getOwnerVisits(
  supabase: SupabaseClient,
  propertyIds: string[],
  limit = 10
) {
  if (propertyIds.length === 0) return []

  const { data } = await supabase
    .from('visits')
    .select('id, property_id, visited_at, checklist, note, created_at, properties(name)')
    .in('property_id', propertyIds)
    .order('visited_at', { ascending: false })
    .limit(limit)

  return data ?? []
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/visits.ts
git commit -m "feat: add visit query utilities with schedule computation"
```

---

## Task 4: Add Visits to Left Nav

**Files:**
- Modify: `src/components/layout/shells/ledger-shell.tsx:1-53`

- [ ] **Step 1: Add the Eye icon import and Visits menu item**

In `src/components/layout/shells/ledger-shell.tsx`, add `ClipboardCheck` to the lucide-react import (line 7, alongside existing icons):

```typescript
import {
  LayoutDashboard,
  Calendar,
  Receipt,
  FileBarChart,
  Menu,
  Users,
  Building2,
  ClipboardList,
  ClipboardCheck,
  Package,
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  HardHat,
  Sparkles,
  X,
  Banknote,
} from 'lucide-react'
```

Then in the `menuItems` array (line 41-53), add Visits right after Properties:

```typescript
const menuItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/visits', label: 'Visits', icon: ClipboardCheck },
  { href: '/owners', label: 'Owners', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: ClipboardList },
  { href: '/contractors', label: 'Contractors', icon: HardHat },
  { href: '/billing', label: 'Billing', icon: Banknote },
  { href: '/reports', label: 'Owner Reports', icon: Sparkles },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/vault', label: 'Vault', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

- [ ] **Step 2: Verify the dev server still compiles**

Run: `npm run dev`
Expected: No compilation errors. Visits item appears in the left nav menu.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/shells/ledger-shell.tsx
git commit -m "feat: add Visits to left nav under Properties"
```

---

## Task 5: Visits Page (Main Admin Page)

**Files:**
- Create: `src/app/(admin)/visits/page.tsx`

- [ ] **Step 1: Create the visits page**

```typescript
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { getPropertyVisitStatuses } from '@/lib/visits'
import { Button } from '@/components/ui/button'

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: { property?: string }
}) {
  const supabase = createServiceClient()
  const statuses = await getPropertyVisitStatuses(supabase)

  // Optional property filter from query param
  const filtered = searchParams.property
    ? statuses.filter(s => s.id === searchParams.property)
    : statuses

  const thisWeek = filtered.filter(s => !s.is_occupied && daysUntil(s.next_visit_due) <= 7)
    .sort((a, b) => daysUntil(a.next_visit_due) - daysUntil(b.next_visit_due))
  const later = filtered.filter(s => !s.is_occupied && daysUntil(s.next_visit_due) > 7)
    .sort((a, b) => daysUntil(a.next_visit_due) - daysUntil(b.next_visit_due))
  const occupied = filtered.filter(s => s.is_occupied)

  const sections = [
    { key: 'this_week', label: 'This Week', items: thisWeek },
    { key: 'later', label: 'Later', items: later },
    { key: 'occupied', label: 'Occupied', items: occupied },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Visits</h1>
        <p className="text-xs text-muted-foreground">
          {filtered.length} properties · {thisWeek.filter(s => daysUntil(s.next_visit_due) < 0).length} overdue
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.key}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {section.label} ({section.items.length})
          </p>

          {section.items.length > 0 ? (
            <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
              {section.items.map((property, i) => {
                const days = daysUntil(property.next_visit_due)
                const isOverdue = days < 0 && !property.is_occupied
                const isDueSoon = days >= 0 && days <= 7 && !property.is_occupied

                return (
                  <div
                    key={property.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''} ${isOverdue ? 'border-l-[3px] border-l-destructive' : isDueSoon ? 'border-l-[3px] border-l-status-warning' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{property.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {property.is_occupied ? (
                          <>
                            {property.occupancy_type === 'owner_stay' ? 'Owner stay until' : 'Guest checkout'}:{' '}
                            {formatDate(property.occupancy_end!)} ·{' '}
                            <span className="text-muted-foreground">
                              Visits resume {formatDate(
                                new Date(new Date(property.occupancy_end!).getTime() + 14 * 24 * 60 * 60 * 1000)
                                  .toISOString().split('T')[0]
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            Last visit: {property.last_visit_date ? formatDate(property.last_visit_date) : 'Never'} ·{' '}
                            {isOverdue ? (
                              <span className="font-semibold text-destructive">{Math.abs(days)} days overdue</span>
                            ) : (
                              `Due in ${days} days`
                            )}
                          </>
                        )}
                      </p>
                      {property.last_admin_note && !property.is_occupied && (
                        <p className="mt-1 text-[11px] text-accent">
                          <span className="mr-1">&#128204;</span>
                          {property.last_admin_note}
                        </p>
                      )}
                    </div>

                    {property.is_occupied ? (
                      <span className="shrink-0 rounded-[var(--radius-badge)] border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        Occupied
                      </span>
                    ) : (
                      <Link href={`/visits/new?property=${property.id}`}>
                        <Button
                          size="sm"
                          className={`h-8 text-xs ${
                            section.key === 'this_week'
                              ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                              : ''
                          }`}
                          variant={section.key === 'this_week' ? 'default' : 'outline'}
                        >
                          Log Visit
                        </Button>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">
              No properties
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev`, navigate to `/visits`
Expected: Page shows 3 sections. All properties appear in "Later" (no visits logged yet, within 14-day grace period from creation).

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/visits/page.tsx
git commit -m "feat: add visits page with This Week / Later / Occupied sections"
```

---

## Task 6: Visit Checklist Component

**Files:**
- Create: `src/components/features/visit-checklist.tsx`

- [ ] **Step 1: Create the checklist toggle component**

```typescript
'use client'

import { VISIT_CHECKLIST_ITEMS, type ChecklistKey } from '@/types'

interface VisitChecklistProps {
  checked: Set<ChecklistKey>
  onChange: (key: ChecklistKey, value: boolean) => void
  readOnly?: boolean
}

export function VisitChecklist({ checked, onChange, readOnly }: VisitChecklistProps) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
      {VISIT_CHECKLIST_ITEMS.map((item, i) => (
        <label
          key={item.key}
          className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 ${
            i > 0 ? 'border-t border-border' : ''
          } ${readOnly ? 'pointer-events-none' : ''}`}
        >
          <input
            type="checkbox"
            checked={checked.has(item.key)}
            onChange={(e) => onChange(item.key, e.target.checked)}
            disabled={readOnly}
            className="h-4 w-4 rounded border-border text-accent accent-accent"
          />
          <span className="text-sm">{item.label}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * Read-only display of completed checklist items (for owner view).
 */
export function VisitChecklistSummary({ checklist }: { checklist: Partial<Record<ChecklistKey, boolean>> }) {
  const completed = VISIT_CHECKLIST_ITEMS.filter(item => checklist[item.key])
  if (completed.length === 0) return null

  return (
    <ul className="space-y-1">
      {completed.map(item => (
        <li key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-status-safe">&#10003;</span>
          {item.label}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/visit-checklist.tsx
git commit -m "feat: add visit checklist toggle and summary components"
```

---

## Task 7: Visit Media Upload Component

**Files:**
- Create: `src/components/features/visit-media-upload.tsx`

- [ ] **Step 1: Create the media upload component**

```typescript
'use client'

import { useState, useRef } from 'react'
import { Camera, X, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface MediaFile {
  id: string
  file: File
  preview: string
  isPrivate: boolean
  fileType: 'image' | 'video'
}

interface VisitMediaUploadProps {
  onFilesChange: (files: MediaFile[]) => void
  files: MediaFile[]
}

export function VisitMediaUpload({ files, onFilesChange }: VisitMediaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    const newFiles: MediaFile[] = selected.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      isPrivate: false,
      fileType: file.type.startsWith('video/') ? 'video' : 'image',
    }))
    onFilesChange([...files, ...newFiles])
    if (inputRef.current) inputRef.current.value = ''
  }

  function togglePrivate(id: string) {
    onFilesChange(files.map(f => f.id === id ? { ...f, isPrivate: !f.isPrivate } : f))
  }

  function removeFile(id: string) {
    const file = files.find(f => f.id === id)
    if (file) URL.revokeObjectURL(file.preview)
    onFilesChange(files.filter(f => f.id !== id))
  }

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border-2 border-dashed border-border bg-card px-4 py-6 text-center transition-colors hover:border-accent"
      >
        <Camera className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Tap to add photos or videos</p>
        <p className="text-[11px] text-muted-foreground/70">Each can be marked private</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map(f => (
            <div key={f.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted">
              {f.fileType === 'image' ? (
                <img src={f.preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">VID</div>
              )}
              {f.isPrivate && (
                <div className="absolute left-0 top-0 rounded-br bg-primary px-1 py-0.5">
                  <Lock className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                className="absolute right-0 top-0 rounded-bl bg-black/50 p-0.5"
              >
                <X className="h-3 w-3 text-white" />
              </button>
              <button
                type="button"
                onClick={() => togglePrivate(f.id)}
                className="absolute bottom-0 left-0 right-0 bg-black/50 py-0.5 text-center text-[9px] font-medium text-white"
              >
                {f.isPrivate ? 'Private' : 'Public'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Upload all media files to Supabase Storage and return metadata for DB insert.
 */
export async function uploadVisitMedia(
  propertyId: string,
  visitId: string,
  files: MediaFile[]
): Promise<{ file_path: string; file_type: string; is_private: boolean }[]> {
  const supabase = createClient()
  const results: { file_path: string; file_type: string; is_private: boolean }[] = []

  for (const f of files) {
    const ext = f.file.name.split('.').pop() || 'jpg'
    const path = `${propertyId}/${visitId}/${f.id}.${ext}`

    const { error } = await supabase.storage
      .from('visit-media')
      .upload(path, f.file, { contentType: f.file.type })

    if (error) {
      toast.error(`Failed to upload ${f.file.name}`)
      continue
    }

    results.push({
      file_path: path,
      file_type: f.fileType,
      is_private: f.isPrivate,
    })
  }

  return results
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/visit-media-upload.tsx
git commit -m "feat: add visit media upload with public/private toggle"
```

---

## Task 8: Visit API Route

**Files:**
- Create: `src/app/api/visits/route.ts`

- [ ] **Step 1: Create the POST endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { property_id, visited_at, checklist, note, admin_note, media } = body

  if (!property_id || !visited_at) {
    return NextResponse.json({ error: 'property_id and visited_at are required' }, { status: 400 })
  }

  // Insert visit
  const { data: visit, error: visitError } = await serviceClient
    .from('visits')
    .insert({
      property_id,
      visited_at,
      checklist: checklist ?? {},
      note: note || null,
      admin_note: admin_note || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (visitError) {
    return NextResponse.json({ error: visitError.message }, { status: 500 })
  }

  // Insert media records if any
  if (media && Array.isArray(media) && media.length > 0) {
    const mediaRows = media.map((m: { file_path: string; file_type: string; is_private: boolean }) => ({
      visit_id: visit.id,
      file_path: m.file_path,
      file_type: m.file_type,
      is_private: m.is_private,
    }))

    const { error: mediaError } = await serviceClient
      .from('visit_media')
      .insert(mediaRows)

    if (mediaError) {
      return NextResponse.json({ error: mediaError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: visit.id })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/visits/route.ts
git commit -m "feat: add POST /api/visits endpoint"
```

---

## Task 9: Log Visit Page

**Files:**
- Create: `src/app/(admin)/visits/new/page.tsx`

- [ ] **Step 1: Create the log visit form page**

```typescript
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { VisitChecklist } from '@/components/features/visit-checklist'
import { VisitMediaUpload, uploadVisitMedia } from '@/components/features/visit-media-upload'
import type { ChecklistKey } from '@/types'

export default function LogVisitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const propertyId = searchParams.get('property') ?? ''
  const propertyName = searchParams.get('name') ?? 'Property'

  const [saving, setSaving] = useState(false)
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0])
  const [checked, setChecked] = useState<Set<ChecklistKey>>(new Set())
  const [note, setNote] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [mediaFiles, setMediaFiles] = useState<Parameters<typeof VisitMediaUpload>[0]['files']>([])

  function handleChecklistChange(key: ChecklistKey, value: boolean) {
    setChecked(prev => {
      const next = new Set(prev)
      if (value) next.add(key)
      else next.delete(key)
      return next
    })
  }

  async function handleSubmit() {
    if (!propertyId) { toast.error('No property selected'); return }
    setSaving(true)

    try {
      // Build checklist object (only checked items)
      const checklist: Partial<Record<ChecklistKey, boolean>> = {}
      for (const key of checked) {
        checklist[key] = true
      }

      // Upload media first to get file paths
      let media: { file_path: string; file_type: string; is_private: boolean }[] = []
      if (mediaFiles.length > 0) {
        // We need a visit ID for the storage path — use a temp ID, then update
        const tempId = crypto.randomUUID()
        media = await uploadVisitMedia(propertyId, tempId, mediaFiles as Parameters<typeof uploadVisitMedia>[2])
      }

      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          visited_at: visitDate,
          checklist,
          note: note || null,
          admin_note: adminNote || null,
          media,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save visit')
      }

      toast.success('Visit logged')
      router.push('/visits')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save visit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/visits" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Log Visit</h1>
          <p className="text-xs text-muted-foreground">{propertyName}</p>
        </div>
      </div>

      {/* Visit Date */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Visit Date</p>
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">Date</span>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="rounded-[var(--radius-button)] border border-border bg-background px-3 py-1.5 font-mono text-sm"
            />
          </div>
        </div>
      </section>

      {/* Checklist */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Checklist ({checked.size}/11)
        </p>
        <VisitChecklist checked={checked} onChange={handleChecklistChange} />
      </section>

      {/* Photos & Videos */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Photos &amp; Videos</p>
        <VisitMediaUpload files={mediaFiles} onFilesChange={setMediaFiles} />
      </section>

      {/* Note for Owner */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Note for Owner</p>
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Everything looks great. Replaced light bulb in kitchen..."
            rows={3}
            className="w-full bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Visible to the property owner</p>
      </section>

      {/* Private Note */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Private Note</p>
        <div className="overflow-hidden rounded-[10px] border border-dashed border-primary bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <span className="text-xs font-semibold">Admin Note</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">ADMIN ONLY</span>
          </div>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Next time: bring screwdriver to tighten chairs..."
            rows={2}
            className="w-full bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Only visible to you — reminders for next visit</p>
      </section>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
        size="lg"
      >
        {saving ? 'Saving...' : 'Save Visit'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev`, navigate to `/visits/new?property=<any-property-id>&name=Test`
Expected: Full form with date picker, checklist, media upload, two note fields, and Save button.

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/visits/new/page.tsx
git commit -m "feat: add log visit page with checklist, media, and notes"
```

---

## Task 10: Visit List Component (Shared)

**Files:**
- Create: `src/components/features/visit-list.tsx`

- [ ] **Step 1: Create the compact visit list component**

This is used on both the property detail page (admin) and the owner portal.

```typescript
import Link from 'next/link'
import { VISIT_CHECKLIST_ITEMS, type ChecklistKey } from '@/types'

interface VisitRow {
  id: string
  property_id: string
  visited_at: string
  checklist: Partial<Record<ChecklistKey, boolean>>
  note: string | null
  created_at: string
  properties?: { name: string } | null
}

interface VisitListProps {
  visits: VisitRow[]
  showPropertyName?: boolean
  viewAllHref?: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function checklistCount(checklist: Partial<Record<ChecklistKey, boolean>>): number {
  return Object.values(checklist).filter(Boolean).length
}

export function VisitList({ visits, showPropertyName, viewAllHref }: VisitListProps) {
  if (visits.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">
        No visits yet
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
        {visits.map((visit, i) => {
          const count = checklistCount(visit.checklist)
          const completedItems = VISIT_CHECKLIST_ITEMS.filter(item => visit.checklist[item.key])

          return (
            <details
              key={visit.id}
              className={`group ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{formatDate(visit.visited_at)}</p>
                    {showPropertyName && visit.properties && (
                      <span className="truncate rounded-[var(--radius-badge)] bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {visit.properties.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {count} item{count !== 1 ? 's' : ''} checked
                    {visit.note && ` · ${visit.note.slice(0, 50)}${visit.note.length > 50 ? '...' : ''}`}
                  </p>
                </div>
                <span className="ml-2 text-xs text-muted-foreground group-open:rotate-90 transition-transform">&#9654;</span>
              </summary>
              <div className="border-t border-border px-4 py-3 space-y-2">
                {completedItems.length > 0 && (
                  <ul className="space-y-1">
                    {completedItems.map(item => (
                      <li key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-status-safe">&#10003;</span>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                )}
                {visit.note && (
                  <p className="text-xs text-muted-foreground">{visit.note}</p>
                )}
              </div>
            </details>
          )
        })}
      </div>
      {viewAllHref && (
        <Link href={viewAllHref} className="block text-center text-xs font-medium text-accent hover:underline">
          View all visits
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/visit-list.tsx
git commit -m "feat: add shared visit list component with expandable rows"
```

---

## Task 11: Add Visits Section to Property Detail Page

**Files:**
- Modify: `src/app/(admin)/properties/[id]/page.tsx`

- [ ] **Step 1: Add import and data fetch**

Add to the imports at the top of the file:

```typescript
import { getPropertyVisits } from '@/lib/visits'
import { VisitList } from '@/components/features/visit-list'
```

Add visits to the `Promise.all` data fetch (around line 37-47). Add this to the destructured array:

```typescript
{ data: visitRows },
```

And add this query to the Promise.all array:

```typescript
serviceClient.from('visits').select('*').eq('property_id', params.id).order('visited_at', { ascending: false }).limit(5),
```

- [ ] **Step 2: Add the Visits section before IEC Electricity (before line 151)**

Insert this section right after the Entry Code section (after line 149) and before the IEC Electricity section:

```tsx
      {/* Visits */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Visits ({visitRows?.length ?? 0})
          </p>
          <Link href={`/visits/new?property=${params.id}&name=${encodeURIComponent(property.name)}`}>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
              <ClipboardCheck className="h-3 w-3" />
              Log Visit
            </Button>
          </Link>
        </div>
        <VisitList
          visits={(visitRows ?? []).map(v => ({
            id: v.id as string,
            property_id: v.property_id as string,
            visited_at: v.visited_at as string,
            checklist: (v.checklist as Record<string, boolean>) ?? {},
            note: v.note as string | null,
            created_at: v.created_at as string,
          }))}
          viewAllHref={`/visits?property=${params.id}`}
        />
      </section>
```

Also add `ClipboardCheck` to the lucide-react import at the top of the file.

- [ ] **Step 3: Verify the section appears**

Run: `npm run dev`, navigate to any property detail page.
Expected: "Visits" section appears as the first content section before IEC Electricity.

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/properties/[id]/page.tsx
git commit -m "feat: add visits section to property detail page"
```

---

## Task 12: Add Last Visit Badge to Property Cards

**Files:**
- Modify: `src/app/(admin)/properties/page.tsx`

- [ ] **Step 1: Fetch last visit dates**

In `src/app/(admin)/properties/page.tsx`, after the properties query (around line 16), add a query for last visits:

```typescript
  const { data: lastVisits } = await supabase
    .from('visits')
    .select('property_id, visited_at')
    .order('visited_at', { ascending: false })

  // Build a map of property_id -> last visit date
  const lastVisitMap = new Map<string, string>()
  for (const v of lastVisits ?? []) {
    if (!lastVisitMap.has(v.property_id)) {
      lastVisitMap.set(v.property_id, v.visited_at)
    }
  }
```

- [ ] **Step 2: Add the badge to each property card**

Inside the card body `<div className="p-3.5">` (around line 67), after the owner/price row but before the closing `</div>` of the card body, add:

```tsx
                    {(() => {
                      const lastVisit = lastVisitMap.get(property.id)
                      const daysAgo = lastVisit
                        ? Math.round((Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24))
                        : null
                      const isOverdue = daysAgo !== null && daysAgo > 14
                      return (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${isOverdue ? 'bg-destructive' : daysAgo !== null ? 'bg-status-safe' : 'bg-muted-foreground'}`} />
                          <span className="text-[11px] text-muted-foreground">
                            {lastVisit
                              ? `Last visit: ${new Date(lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                              : 'No visits'}
                          </span>
                        </div>
                      )
                    })()}
```

- [ ] **Step 3: Verify on the properties page**

Run: `npm run dev`, navigate to `/properties`
Expected: Each property card shows "Last visit: [date]" or "No visits" with a colored dot.

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/properties/page.tsx
git commit -m "feat: add last visit badge with color indicator to property cards"
```

---

## Task 13: Add Visits Section to Owner Portal

**Files:**
- Modify: `src/app/(owner)/owner/page.tsx`

- [ ] **Step 1: Add import**

Add to the imports:

```typescript
import { getOwnerVisits } from '@/lib/visits'
import { VisitList } from '@/components/features/visit-list'
```

- [ ] **Step 2: Add visits data fetch**

In the `Promise.all` block (around lines 51-73), add a new query. Add to the destructured array:

```typescript
{ data: ownerVisits },
```

And add this to the Promise.all:

```typescript
    propertyIds.length > 0
      ? supabase.from('visits').select('id, property_id, visited_at, checklist, note, created_at, properties(name)').in('property_id', propertyIds).order('visited_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
```

- [ ] **Step 3: Add the Visits section to the JSX**

Add this section near the top of the owner dashboard content (before the bookings section, to give visits prominent placement):

```tsx
      {/* Visits */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Recent Visits ({(ownerVisits as unknown[])?.length ?? 0})
        </p>
        <VisitList
          visits={((ownerVisits as Array<Record<string, unknown>>) ?? []).map(v => ({
            id: v.id as string,
            property_id: v.property_id as string,
            visited_at: v.visited_at as string,
            checklist: (v.checklist as Record<string, boolean>) ?? {},
            note: v.note as string | null,
            created_at: v.created_at as string,
            properties: v.properties as { name: string } | null,
          }))}
          showPropertyName
        />
      </section>
```

- [ ] **Step 4: Verify on the owner portal**

Test by logging in as an owner (or checking the owner portal page).
Expected: "Recent Visits" section appears with property names on each row.

- [ ] **Step 5: Commit**

```bash
git add src/app/(owner)/owner/page.tsx
git commit -m "feat: add visits section to owner portal dashboard"
```

---

## Task 14: Create Supabase Storage Bucket

- [ ] **Step 1: Create the visit-media storage bucket**

This needs to be done via the Supabase dashboard or CLI. Add to the migration file or create a new one:

Run via Supabase SQL editor or add to migration:

```sql
-- Create storage bucket for visit media (run in Supabase dashboard SQL editor)
INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-media', 'visit-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Admin upload visit media" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'visit-media' AND is_admin());

CREATE POLICY "Admin delete visit media" ON storage.objects FOR DELETE
  USING (bucket_id = 'visit-media' AND is_admin());

CREATE POLICY "Admin read visit media" ON storage.objects FOR SELECT
  USING (bucket_id = 'visit-media' AND is_admin());

CREATE POLICY "Owners read public visit media" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'visit-media'
    AND (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM properties p
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );
```

If adding to migration file, append to `supabase/migrations/00023_visits.sql`.

- [ ] **Step 2: Commit if migration file was updated**

```bash
git add supabase/migrations/00023_visits.sql
git commit -m "feat: add visit-media storage bucket with RLS policies"
```

---

## Task 15: Wire Up Log Visit Button on Visits Page

**Files:**
- Modify: `src/app/(admin)/visits/page.tsx`

- [ ] **Step 1: Update the Log Visit link to include property name**

In the visits page (Task 5), the Log Visit button already links to `/visits/new?property=${property.id}`. Update it to also pass the property name:

```tsx
<Link href={`/visits/new?property=${property.id}&name=${encodeURIComponent(property.name)}`}>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/visits/page.tsx
git commit -m "fix: pass property name to log visit page URL"
```

---

## Task 16: End-to-End Verification

- [ ] **Step 1: Build check**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Manual smoke test**

Test this flow:
1. Navigate to `/visits` — see properties in 3 sections
2. Click "Log Visit" on a property — form page opens
3. Select date, check some items, add a public note, add a private note
4. Click "Save Visit" — redirects to visits page
5. Verify the property's "Last visit" date updated
6. Navigate to property detail page — Visits section shows the logged visit
7. Navigate to properties grid — "Last visit" badge shows on card
8. Check owner portal (if accessible) — visit appears with checked items and public note only

- [ ] **Step 3: Commit any fixes and final commit**

```bash
git add -A
git commit -m "feat: visit management — complete implementation"
```
