# Guest Link Expiry & Code Update Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship (1) per-link reveal/expiry controls on guest magic links decoupled from bookings, (2) a Canva-integrated workflow that updates apartment + building codes in ApartmentOS and Canva guides in one shot, and (3) a PWA cache fix so DB code updates aren't masked on guest pages.

**Architecture:**
- Reveal/expiry timestamps are computed client-side in the magic-link generator from a day count + fixed Jerusalem hours (07:00 reveal, 23:59 expiry). Server persists both as nullable `timestamptz` columns; the magic_links row is the source of truth.
- The Canva integration uses a single Canva OAuth app whose access + refresh tokens live encrypted in `app_settings` (one connection per Marcus account, used by all admins). Code updates run via a job row in `code_update_jobs`, polled by the client. Each property update is independent: DB write first, then Canva call via Anthropic Messages API + Canva MCP server using the stored OAuth token as `authorization_token`.
- PWA service worker is configured to bypass `/guest/`, `/contractor/`, and `/api/` so DB-backed code changes appear immediately on refresh.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Tailwind, vitest, @ducanh2912/next-pwa, jose (JWT), @anthropic-ai/sdk (already in repo), Canva Connect REST + MCP.

**Spec:** [docs/superpowers/specs/2026-05-29-guest-link-expiry-and-code-update-design.md](../specs/2026-05-29-guest-link-expiry-and-code-update-design.md)

**Migration numbers in this plan:** 00030 and 00031 (latest existing is 00029).

**Implementation pattern note (deviation from spec):** the existing project uses a single `src/app/(admin)/settings/page.tsx` with multiple `<section>` blocks rather than a separate `/settings/integrations` sub-route. We follow that pattern — the Canva connect UI is a new `<section>` on the existing settings page, not a new sub-page. The spec's wording about a sub-page is superseded by this choice.

---

## Phase 0 — Foundation (PWA fix + migrations)

### Task 1: PWA cache exclusion + force-dynamic on token pages

**Files:**
- Modify: `next.config.js`
- Modify: `src/app/guest/[token]/page.tsx` (add export at top)
- Modify: `src/app/contractor/[token]/page.tsx` (add export at top)

- [ ] **Step 1: Replace next.config.js**

Replace the entire contents of `next.config.js` with:

```js
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  workboxOptions: {
    navigateFallbackDenylist: [/^\/guest\//, /^\/contractor\//, /^\/api\//],
    runtimeCaching: [
      {
        urlPattern: ({ url }) =>
          url.pathname.startsWith('/guest/') ||
          url.pathname.startsWith('/contractor/') ||
          url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'l.icdbcdn.com' },
    ],
  },
}

module.exports = withPWA(nextConfig)
```

- [ ] **Step 2: Add force-dynamic to guest page**

At the top of `src/app/guest/[token]/page.tsx`, immediately after the existing imports block, add:

```ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
```

- [ ] **Step 3: Add force-dynamic to contractor page**

At the top of `src/app/contractor/[token]/page.tsx`, immediately after the imports block, add the same two lines:

```ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
```

- [ ] **Step 4: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds; the PWA plugin logs the new runtime caching rules.

- [ ] **Step 5: Commit**

```bash
git add next.config.js src/app/guest/\[token\]/page.tsx src/app/contractor/\[token\]/page.tsx
git commit -m "fix(pwa): bypass cache for guest/contractor/api routes so DB updates aren't masked"
```

---

### Task 2: Migration — magic_link reveal/expiry columns

**Files:**
- Create: `supabase/migrations/00030_magic_link_reveal_expiry.sql`

- [ ] **Step 1: Create the migration file**

Write `supabase/migrations/00030_magic_link_reveal_expiry.sql`:

```sql
-- Make expires_at nullable (NULL = never expires) and add code_reveals_at gate.
ALTER TABLE magic_links
  ALTER COLUMN expires_at DROP NOT NULL,
  ADD COLUMN code_reveals_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN magic_links.code_reveals_at IS
  'Server-side time gate for revealing entry_code on the guest page. NULL = reveal immediately.';
COMMENT ON COLUMN magic_links.expires_at IS
  'When the link stops working. NULL = never expires.';
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: migration `00030_magic_link_reveal_expiry` applied successfully.

- [ ] **Step 3: Verify in DB**

Run via Supabase MCP `execute_sql`:

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'magic_links'
  AND column_name IN ('expires_at', 'code_reveals_at');
```

Expected:
- `expires_at` → `is_nullable = YES`, `data_type = timestamp with time zone`
- `code_reveals_at` → `is_nullable = YES`, `data_type = timestamp with time zone`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00030_magic_link_reveal_expiry.sql
git commit -m "feat(db): add code_reveals_at and make expires_at nullable on magic_links"
```

---

### Task 3: Migration — code_update_jobs table

**Files:**
- Create: `supabase/migrations/00031_code_update_jobs.sql`

- [ ] **Step 1: Create the migration file**

Write `supabase/migrations/00031_code_update_jobs.sql`:

```sql
CREATE TABLE code_update_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id),
  apartment_code TEXT,
  building_code TEXT,
  property_ids UUID[] NOT NULL,
  update_canva BOOLEAN NOT NULL DEFAULT true,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_code_update_jobs_created_by ON code_update_jobs(created_by);

ALTER TABLE code_update_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on code_update_jobs" ON code_update_jobs FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

COMMENT ON COLUMN code_update_jobs.results IS
  'Per-property results: { [property_id]: { db: "ok"|"failed", canva: "ok"|"skipped"|"failed", message: string } }';
COMMENT ON COLUMN code_update_jobs.status IS 'running | done';
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: migration applied successfully.

- [ ] **Step 3: Verify RLS**

Run via Supabase MCP `execute_sql`:

```sql
SELECT polname, polqual::text
FROM pg_policy
WHERE polrelid = 'code_update_jobs'::regclass;
```

Expected: one row, `polname = 'Admin full access on code_update_jobs'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00031_code_update_jobs.sql
git commit -m "feat(db): add code_update_jobs table for tracking code change runs"
```

---

## Phase 1 — Section A: Guest magic link expiry & reveal

### Task 4: Magic links lib — reveal/expiry timestamp helpers + validation

**Files:**
- Modify: `src/lib/magic-links.ts`
- Modify: `src/lib/magic-links.test.ts`

The form sends absolute ISO timestamps, but we need server-side validation and a helper to compute the day-count → ISO conversion for unit tests and any server-side consumers.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/magic-links.test.ts`:

```ts
import { computeRevealAt, computeExpiresAt, validateRevealAndExpiry } from './magic-links'

describe('computeRevealAt', () => {
  it('returns null when reveal_in_days is null (reveal immediately)', () => {
    expect(computeRevealAt(null, new Date('2026-06-03T10:00:00Z'))).toBeNull()
  })

  it('returns 07:00 Jerusalem time on day N when day count provided', () => {
    // 2026-06-03 10:00 UTC = 13:00 Jerusalem (IDT, UTC+3)
    // reveal_in_days = 2 → 2026-06-05 07:00 Jerusalem = 2026-06-05 04:00 UTC
    const result = computeRevealAt(2, new Date('2026-06-03T10:00:00Z'))
    expect(result?.toISOString()).toBe('2026-06-05T04:00:00.000Z')
  })

  it('handles day 0 (today at 7am Jerusalem if not yet past, else now)', () => {
    // If "0 days" + the 07:00 mark already passed today, reveal is now (this is what "reveal immediately" means via checkbox; day=0 in input falls through to the same effective immediate semantics)
    const result = computeRevealAt(0, new Date('2026-06-03T10:00:00Z'))
    // 07:00 Jerusalem on 2026-06-03 = 04:00 UTC, already passed → returns the 07:00 marker (in the past)
    expect(result?.toISOString()).toBe('2026-06-03T04:00:00.000Z')
  })
})

describe('computeExpiresAt', () => {
  it('returns null when expires_in_days is null (never expires)', () => {
    expect(computeExpiresAt(null, new Date('2026-06-03T10:00:00Z'))).toBeNull()
  })

  it('returns 23:59 Jerusalem time on day N from creation', () => {
    // 2026-06-03 10:00 UTC; expires_in_days = 5 → 2026-06-08 23:59 Jerusalem = 2026-06-08 20:59 UTC
    const result = computeExpiresAt(5, new Date('2026-06-03T10:00:00Z'))
    expect(result?.toISOString()).toBe('2026-06-08T20:59:00.000Z')
  })
})

describe('validateRevealAndExpiry', () => {
  it('passes when both are null', () => {
    expect(() => validateRevealAndExpiry(null, null)).not.toThrow()
  })

  it('passes when reveal is before expiry', () => {
    expect(() =>
      validateRevealAndExpiry(
        new Date('2026-06-04T04:00:00Z'),
        new Date('2026-06-10T20:59:00Z'),
      ),
    ).not.toThrow()
  })

  it('throws when reveal is after expiry', () => {
    expect(() =>
      validateRevealAndExpiry(
        new Date('2026-06-10T04:00:00Z'),
        new Date('2026-06-05T20:59:00Z'),
      ),
    ).toThrow(/reveal.*after.*expir/i)
  })

  it('throws when expires_at is in the past', () => {
    // assume current time is well after 2020
    expect(() => validateRevealAndExpiry(null, new Date('2020-01-01T00:00:00Z')))
      .toThrow(/past/i)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- src/lib/magic-links.test.ts`
Expected: 7 new tests fail with "function not defined" or import errors.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/magic-links.ts` after the existing exports:

```ts
const JERUSALEM_TZ = 'Asia/Jerusalem'

/** Returns the UTC timestamp for HH:00 Jerusalem time on the day that is `days` days from `from`. */
function jerusalemDateAt(days: number, hour: number, minute: number, from: Date): Date {
  // Determine the Jerusalem-local date `days` days from `from`.
  // We use the Intl API to get the Jerusalem-local Y-M-D, then construct a UTC timestamp
  // by determining what UTC instant maps to that local Y-M-D-hour-minute in Jerusalem.
  const fromInJerusalem = new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from)

  const y = Number(fromInJerusalem.find((p) => p.type === 'year')!.value)
  const m = Number(fromInJerusalem.find((p) => p.type === 'month')!.value)
  const d = Number(fromInJerusalem.find((p) => p.type === 'day')!.value)

  // Build a Date representing `y-m-d + days at hour:minute Jerusalem time`.
  // Trick: construct an ISO string with a +03:00 offset (Jerusalem is +02 in winter / +03 summer).
  // To handle DST correctly, build a candidate UTC timestamp and then nudge it.
  const targetDate = new Date(Date.UTC(y, m - 1, d + days, hour, minute, 0))

  // Determine Jerusalem offset at targetDate (in minutes).
  const jerusalemOffsetMin = jerusalemOffsetMinutes(targetDate)

  // targetDate is currently treating hour:minute as UTC; we want them as Jerusalem-local.
  // Subtract the offset to get the correct UTC instant.
  return new Date(targetDate.getTime() - jerusalemOffsetMin * 60 * 1000)
}

function jerusalemOffsetMinutes(at: Date): number {
  // Returns the Jerusalem UTC offset in minutes at the given instant (e.g. 120 in winter, 180 in summer).
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: JERUSALEM_TZ,
    timeZoneName: 'shortOffset',
  })
  const parts = dtf.formatToParts(at)
  const tzNamePart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2'
  // tzNamePart looks like "GMT+3" or "GMT+2"
  const match = tzNamePart.match(/GMT([+-]\d+)(?::(\d+))?/)
  if (!match) return 120
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  return hours * 60 + (hours < 0 ? -minutes : minutes)
}

export function computeRevealAt(revealInDays: number | null, from: Date = new Date()): Date | null {
  if (revealInDays === null) return null
  return jerusalemDateAt(revealInDays, 7, 0, from)
}

export function computeExpiresAt(expiresInDays: number | null, from: Date = new Date()): Date | null {
  if (expiresInDays === null) return null
  return jerusalemDateAt(expiresInDays, 23, 59, from)
}

export function validateRevealAndExpiry(
  revealAt: Date | null,
  expiresAt: Date | null,
  now: Date = new Date(),
): void {
  if (expiresAt && expiresAt < now) {
    throw new Error('expires_at is in the past')
  }
  if (revealAt && expiresAt && revealAt > expiresAt) {
    throw new Error('code_reveals_at cannot be after expires_at')
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test -- src/lib/magic-links.test.ts`
Expected: all tests pass, including pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/magic-links.ts src/lib/magic-links.test.ts
git commit -m "feat(magic-links): add reveal/expiry timestamp helpers and validation"
```

---

### Task 5: Update `/api/magic-links` route to accept new params

**Files:**
- Modify: `src/app/api/magic-links/route.ts`

- [ ] **Step 1: Rewrite the route handler**

Replace `src/app/api/magic-links/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  generateMagicLinkToken,
  validateRevealAndExpiry,
} from '@/lib/magic-links'
import { requireAdmin, AuthError } from '@/lib/auth'
import { sendContractorMagicLink, sendGuestCheckInLink } from '@/lib/email'
import type { MagicLinkType } from '@/types'

/** POST /api/magic-links — Generate a new magic link and optionally email it */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    property_id,
    task_id,
    task_ids,
    contractor_id,
    booking_id,
    link_type,
    send_email = true,
    expires_at: expiresAtRaw = null,
    code_reveals_at: codeRevealsAtRaw = null,
  } = body as {
    property_id: string
    task_id?: string
    task_ids?: string[]
    contractor_id?: string
    booking_id?: string
    link_type: MagicLinkType
    send_email?: boolean
    expires_at?: string | null
    code_reveals_at?: string | null
  }

  if (!property_id || !link_type) {
    return NextResponse.json(
      { error: 'property_id and link_type are required' },
      { status: 400 }
    )
  }

  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null
  const codeRevealsAt = codeRevealsAtRaw ? new Date(codeRevealsAtRaw) : null

  try {
    validateRevealAndExpiry(codeRevealsAt, expiresAt)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid reveal/expiry' },
      { status: 400 },
    )
  }

  // JWT exp: if expires_at is null, use a far-future expiry; the DB row is the actual gate.
  const TEN_YEARS_HOURS = 24 * 365 * 10
  const expiresInHoursForJwt = expiresAt
    ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)))
    : TEN_YEARS_HOURS

  try {
    const token = await generateMagicLinkToken(
      { property_id, task_id, contractor_id, booking_id, link_type },
      expiresInHoursForJwt,
    )

    const serviceClient = createServiceClient()

    const { error: dbError } = await serviceClient
      .from('magic_links')
      .insert({
        token,
        link_type,
        property_id,
        task_id: task_id || null,
        contractor_id: contractor_id || null,
        booking_id: booking_id || null,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        code_reveals_at: codeRevealsAt ? codeRevealsAt.toISOString() : null,
      })

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const prefix = link_type === 'guest' ? 'guest' : 'contractor'
    const url = `${baseUrl}/${prefix}/${token}`

    let emailSent = false
    if (send_email) {
      const { data: property } = await serviceClient
        .from('properties')
        .select('name')
        .eq('id', property_id)
        .single()

      const propertyName = property?.name || 'Property'

      if (link_type === 'contractor' && contractor_id) {
        const { data: contractor } = await serviceClient
          .from('contractors')
          .select('name, email')
          .eq('id', contractor_id)
          .single()

        if (contractor?.email) {
          let taskTitle = 'Task Assignment'
          if (task_id) {
            const { data: task } = await serviceClient
              .from('tasks')
              .select('title')
              .eq('id', task_id)
              .single()
            taskTitle = task?.title || taskTitle
          } else if (task_ids?.length) {
            const { data: tasks } = await serviceClient
              .from('tasks')
              .select('title')
              .in('id', task_ids)
            taskTitle = (tasks ?? []).map((t) => t.title).join(', ')
          }

          await sendContractorMagicLink(
            contractor.email,
            contractor.name,
            propertyName,
            taskTitle,
            url,
          )
          emailSent = true
        }
      }

      if (link_type === 'guest' && booking_id) {
        const { data: booking } = await serviceClient
          .from('bookings')
          .select('guest_name, check_in, guest_email')
          .eq('id', booking_id)
          .single()

        if (booking?.guest_email) {
          await sendGuestCheckInLink(
            booking.guest_email,
            booking.guest_name || 'Guest',
            propertyName,
            booking.check_in,
            url,
            codeRevealsAt,
          )
          emailSent = true
        }
      }
    }

    return NextResponse.json({
      token,
      url,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      code_reveals_at: codeRevealsAt ? codeRevealsAt.toISOString() : null,
      email_sent: emailSent,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate magic link' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `sendGuestCheckInLink` signature mismatch — that gets fixed in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/magic-links/route.ts
git commit -m "feat(magic-links): accept absolute expires_at and code_reveals_at params"
```

(Type error from `sendGuestCheckInLink` may remain — resolved in Task 7.)

---

### Task 6: Guest page — DB-backed reveal gate and expiry check

**Files:**
- Modify: `src/app/guest/[token]/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire body of `src/app/guest/[token]/page.tsx` (preserving the `dynamic`/`revalidate` exports added in Task 1):

```tsx
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { ShieldOff } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyMagicLinkToken } from '@/lib/magic-links'
import { GuestCheckIn } from '@/components/features/guest-check-in'

export default async function GuestCheckInPage({
  params,
}: {
  params: { token: string }
}) {
  try {
    const payload = await verifyMagicLinkToken(params.token)

    if (payload.link_type !== 'guest') {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] p-4">
          <p className="text-sm text-muted-foreground">Invalid link type.</p>
        </div>
      )
    }

    const serviceClient = createServiceClient()

    const { data: magicLink } = await serviceClient
      .from('magic_links')
      .select('id, expires_at, code_reveals_at, is_used')
      .eq('token', params.token)
      .single()

    if (!magicLink) notFound()

    // DB-backed expiry check (overrides the JWT exp claim, which is a far-future placeholder when DB expires_at is null).
    if (magicLink.expires_at && new Date() > new Date(magicLink.expires_at)) {
      throw new Error('expired')
    }

    const { data: property } = await serviceClient
      .from('properties')
      .select('name, address, neighborhood, city, entry_code, building_entry_code, youtube_tutorial_url, canva_design_url')
      .eq('id', payload.property_id)
      .single()

    if (!property) notFound()

    let booking = null
    if (payload.booking_id) {
      const { data } = await serviceClient
        .from('bookings')
        .select('check_in, check_out, guest_name, guest_language')
        .eq('id', payload.booking_id)
        .single()
      booking = data
    }

    // Reveal gate: if code_reveals_at is null, reveal immediately. Otherwise wait until that timestamp.
    const codeIsRevealed =
      magicLink.code_reveals_at === null ||
      new Date() >= new Date(magicLink.code_reveals_at)

    const entryCode = codeIsRevealed ? property.entry_code : null
    const buildingEntryCode = codeIsRevealed ? property.building_entry_code : null

    let guideText: string | null = null
    try {
      const lang = (booking as Record<string, unknown>)?.guest_language as string || 'en'
      const guideRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/guest-guide?property_id=${payload.property_id}&lang=${lang}`,
        { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } },
      )
      if (guideRes.ok) {
        const guideData = await guideRes.json()
        guideText = guideData.content
      }
    } catch {
      // Guide fetch failed — page still works without it
    }

    return (
      <GuestCheckIn
        property={{ ...property, entry_code: entryCode, building_entry_code: buildingEntryCode }}
        booking={booking}
        guideText={guideText}
      />
    )
  } catch {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] bg-muted">
            <ShieldOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">Invalid Link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is invalid or has expired. Contact your host for assistance.
          </p>
        </div>
      </div>
    )
  }
}
```

- [ ] **Step 2: Manually verify the page renders for an existing link**

Run: `npm run dev`
Then visit an existing valid guest magic link URL in the browser.
Expected: page renders normally; if the link's old DB row had `expires_at` set in the future and no `code_reveals_at`, the entry code shows.

- [ ] **Step 3: Commit**

```bash
git add src/app/guest/\[token\]/page.tsx
git commit -m "feat(guest): DB-backed reveal/expiry gate (replaces booking-tied 24h gate)"
```

---

### Task 7: Email helper — accept optional codeRevealsAt for guest email

**Files:**
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Find the existing signature**

Run: `grep -n "sendGuestCheckInLink" src/lib/email.ts`
Note the current parameter list — it likely ends with `url: string`.

- [ ] **Step 2: Update the function signature and body**

In `src/lib/email.ts`, change the `sendGuestCheckInLink` signature to accept an optional `codeRevealsAt: Date | null` as the last argument. Adjust the email HTML/text body to include this line when `codeRevealsAt` is in the future:

```html
<p>Your entry code will appear at <strong>${formatJerusalemDateTime(codeRevealsAt)}</strong>.</p>
```

Add a tiny helper at the top of the file (if no such helper already exists):

```ts
function formatJerusalemDateTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}
```

Wrap the new HTML line in a conditional so it only renders when `codeRevealsAt && codeRevealsAt > new Date()`.

- [ ] **Step 3: Verify type check passes**

Run: `npx tsc --noEmit`
Expected: no errors. The Task 5 caller now matches.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(email): mention scheduled code reveal time in guest check-in email"
```

---

### Task 8: Magic link generator UI — reveal/expiry controls

**Files:**
- Modify: `src/components/features/magic-link-generator.tsx`

This task replaces the "Guest Check-in Link" branch with a form. The contractor branch is unchanged.

- [ ] **Step 1: Rewrite the component**

Replace `src/components/features/magic-link-generator.tsx` with:

```tsx
'use client'

import { useState, useMemo } from 'react'
import { Link2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
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

interface MagicLinkGeneratorProps {
  propertyId: string
  propertyName: string
}

interface TaskOption {
  id: string
  title: string
  status: string
  contractor_name: string | null
}

const JERUSALEM_TZ = 'Asia/Jerusalem'

function fmt(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

function jerusalemOffsetMinutes(at: Date): number {
  const tzNamePart =
    new Intl.DateTimeFormat('en-US', { timeZone: JERUSALEM_TZ, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2'
  const match = tzNamePart.match(/GMT([+-]\d+)(?::(\d+))?/)
  if (!match) return 120
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  return hours * 60 + (hours < 0 ? -minutes : minutes)
}

function jerusalemDateAt(days: number, hour: number, minute: number, from: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from)
  const y = Number(parts.find((p) => p.type === 'year')!.value)
  const m = Number(parts.find((p) => p.type === 'month')!.value)
  const d = Number(parts.find((p) => p.type === 'day')!.value)
  const candidate = new Date(Date.UTC(y, m - 1, d + days, hour, minute, 0))
  const offsetMin = jerusalemOffsetMinutes(candidate)
  return new Date(candidate.getTime() - offsetMin * 60 * 1000)
}

export function MagicLinkGenerator({ propertyId, propertyName }: MagicLinkGeneratorProps) {
  const [step, setStep] = useState<'type' | 'guest-options' | 'tasks' | 'done'>('type')
  const [generating, setGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())

  // Guest form state
  const [revealImmediately, setRevealImmediately] = useState(false)
  const [revealInDays, setRevealInDays] = useState<string>('')
  const [neverExpires, setNeverExpires] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState<string>('')

  function reset() {
    setStep('type')
    setGeneratedUrl(null)
    setCopied(false)
    setSelectedTasks(new Set())
    setRevealImmediately(false)
    setRevealInDays('')
    setNeverExpires(false)
    setExpiresInDays('')
  }

  const now = useMemo(() => new Date(), [step]) // re-anchor when drawer state changes

  const revealAtPreview = useMemo(() => {
    if (revealImmediately) return null
    const n = Number(revealInDays)
    if (revealInDays === '' || isNaN(n) || n < 0 || n > 30) return null
    return jerusalemDateAt(n, 7, 0, now)
  }, [revealImmediately, revealInDays, now])

  const expiresAtPreview = useMemo(() => {
    if (neverExpires) return null
    const n = Number(expiresInDays)
    if (expiresInDays === '' || isNaN(n) || n < 0 || n > 30) return null
    return jerusalemDateAt(n, 23, 59, now)
  }, [neverExpires, expiresInDays, now])

  const revealChosen = revealImmediately || revealInDays !== ''
  const expiryChosen = neverExpires || expiresInDays !== ''
  const canGenerateGuest = revealChosen && expiryChosen && !generating

  async function handleContractorClick() {
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .select('id, title, status, contractors(name)')
      .eq('property_id', propertyId)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })

    const taskList = (data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      contractor_name: (t.contractors as unknown as { name: string } | null)?.name || null,
    }))

    if (taskList.length === 0) {
      await generateContractor()
    } else {
      setTasks(taskList)
      setSelectedTasks(new Set(taskList.map((t) => t.id)))
      setStep('tasks')
    }
  }

  function toggleTask(taskId: string) {
    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  async function generateContractor() {
    setGenerating(true)
    setGeneratedUrl(null)
    try {
      const taskId = selectedTasks.size > 0 ? Array.from(selectedTasks)[0] : undefined
      const res = await fetch('/api/magic-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          link_type: 'contractor',
          task_id: taskId,
          task_ids: Array.from(selectedTasks),
          // contractor links keep the existing default — 72 hours via JWT, no DB row reveal.
          // Compute 72h-from-now as ISO so the server stores it on the row consistently.
          expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          code_reveals_at: null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to generate')
      }
      const { url } = await res.json()
      setGeneratedUrl(url)
      setStep('done')
      toast.success('Contractor link generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setGenerating(false)
    }
  }

  async function generateGuest() {
    setGenerating(true)
    setGeneratedUrl(null)
    try {
      const res = await fetch('/api/magic-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          link_type: 'guest',
          code_reveals_at: revealAtPreview ? revealAtPreview.toISOString() : null,
          expires_at: expiresAtPreview ? expiresAtPreview.toISOString() : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to generate')
      }
      const { url } = await res.json()
      setGeneratedUrl(url)
      setStep('done')
      toast.success('Guest link generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setGenerating(false)
    }
  }

  async function copyToClipboard() {
    if (!generatedUrl) return
    await navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    toast.success('Link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Drawer onOpenChange={(open) => { if (!open) reset() }}>
      <DrawerTrigger asChild>
        <Button className="w-full rounded-[var(--radius-button)] sm:w-auto" size="sm">
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          Generate Magic Link
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Generate Magic Link</DrawerTitle>
          <DrawerDescription>Create a secure link for {propertyName}.</DrawerDescription>
        </DrawerHeader>

        <div className="p-4">
          {step === 'type' && (
            <div className="space-y-3">
              <button
                onClick={handleContractorClick}
                disabled={generating}
                className="flex w-full items-center justify-between rounded-[10px] border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-semibold">Contractor Link</p>
                  <p className="text-xs text-muted-foreground">Task checklist, photo upload, entry code, Waze · 72h expiry</p>
                </div>
              </button>
              <button
                onClick={() => setStep('guest-options')}
                disabled={generating}
                className="flex w-full items-center justify-between rounded-[10px] border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-semibold">Guest Check-in Link</p>
                  <p className="text-xs text-muted-foreground">Pick when the code reveals and when the link expires</p>
                </div>
              </button>
            </div>
          )}

          {step === 'guest-options' && (
            <div className="space-y-4">
              <section className="rounded-[10px] border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Code reveal</p>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={revealImmediately}
                    onChange={(e) => {
                      setRevealImmediately(e.target.checked)
                      if (e.target.checked) setRevealInDays('')
                    }}
                  />
                  Reveal immediately
                </label>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span>Reveal in</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={revealInDays}
                    onChange={(e) => {
                      setRevealInDays(e.target.value)
                      if (e.target.value !== '') setRevealImmediately(false)
                    }}
                    disabled={revealImmediately}
                    className="h-8 w-20 rounded-[6px] border border-border bg-background px-2 text-sm"
                  />
                  <span>days</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {revealImmediately
                    ? 'Code shows on first open.'
                    : revealAtPreview
                      ? `Code reveals ${fmt(revealAtPreview)} (Jerusalem)`
                      : 'Pick a number of days or check the box above.'}
                </p>
              </section>

              <section className="rounded-[10px] border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Link expiry</p>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={neverExpires}
                    onChange={(e) => {
                      setNeverExpires(e.target.checked)
                      if (e.target.checked) setExpiresInDays('')
                    }}
                  />
                  Never expires
                </label>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span>Expires in</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={expiresInDays}
                    onChange={(e) => {
                      setExpiresInDays(e.target.value)
                      if (e.target.value !== '') setNeverExpires(false)
                    }}
                    disabled={neverExpires}
                    className="h-8 w-20 rounded-[6px] border border-border bg-background px-2 text-sm"
                  />
                  <span>days</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {neverExpires
                    ? 'Link never expires.'
                    : expiresAtPreview
                      ? `Expires ${fmt(expiresAtPreview)} (Jerusalem)`
                      : 'Pick a number of days or check the box above.'}
                </p>
              </section>

              <Button
                onClick={generateGuest}
                disabled={!canGenerateGuest}
                className="h-11 w-full"
              >
                {generating ? 'Generating...' : 'Generate Guest Link'}
              </Button>
            </div>
          )}

          {step === 'tasks' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select tasks to include in the contractor link:</p>
              <div className="max-h-[300px] space-y-1 overflow-y-auto">
                {tasks.map((task) => (
                  <label
                    key={task.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={() => toggleTask(task.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.contractor_name && (
                        <p className="text-[10px] text-muted-foreground">{task.contractor_name}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-[var(--radius-badge)] bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize">
                      {task.status}
                    </span>
                  </label>
                ))}
              </div>
              <Button
                onClick={generateContractor}
                disabled={generating || selectedTasks.size === 0}
                className="h-11 w-full"
              >
                {generating ? 'Generating...' : `Generate Link (${selectedTasks.size} task${selectedTasks.size !== 1 ? 's' : ''})`}
              </Button>
            </div>
          )}

          {step === 'done' && generatedUrl && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="break-all font-mono text-xs text-foreground">{generatedUrl}</p>
              </div>
              <Button onClick={copyToClipboard} className="w-full gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>
          )}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
```

- [ ] **Step 2: Manually test the form**

Run: `npm run dev`
Open a property page, click "Generate Magic Link" → "Guest Check-in Link".
Verify: typing a number under "Reveal in" updates the preview; checking "Reveal immediately" disables the input and updates copy; the Generate button stays disabled until both sections have a choice; clicking Generate returns a link and the page advances to "done".

- [ ] **Step 3: Commit**

```bash
git add src/components/features/magic-link-generator.tsx
git commit -m "feat(magic-links): guest link generator with reveal/expiry controls"
```

---

## Phase 2 — Section B: Code update workflow

### Task 9: `lib/canva.ts` — design ID parser + types

**Files:**
- Create: `src/lib/canva.ts`
- Create: `src/lib/canva.test.ts`

- [ ] **Step 1: Write failing test**

Write `src/lib/canva.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseCanvaDesignId } from './canva'

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
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npm test -- src/lib/canva.test.ts`
Expected: tests fail with "cannot find module" or "function not defined."

- [ ] **Step 3: Create lib/canva.ts with the parser + types**

Write `src/lib/canva.ts`:

```ts
export interface CanvaTokens {
  access_token: string
  refresh_token: string
  expires_at: string // ISO
}

export function parseCanvaDesignId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)/)
  return match?.[1] ?? null
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- src/lib/canva.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canva.ts src/lib/canva.test.ts
git commit -m "feat(canva): design ID parser and token type"
```

---

### Task 10: `lib/canva.ts` — token storage + OAuth code exchange

**Files:**
- Modify: `src/lib/canva.ts`

Tokens are stored in `app_settings` under three keys: `canva_access_token`, `canva_refresh_token`, `canva_token_expires_at`. Values are already application-layer encrypted (existing `app_settings` pattern — see `value: encrypted` comment in `00001_initial_schema.sql:261`). We reuse that encryption.

- [ ] **Step 1: Confirm the existing encryption helper**

Run: `grep -rn "encryptSetting\|decryptSetting\|app_settings" src/lib/ | head -10`
Find the existing encrypt/decrypt helpers used elsewhere (likely `src/lib/encryption.ts` or similar). Use those.

If no helper exists, use a minimal one:

```ts
// In src/lib/canva.ts only if no existing app-wide helper exists:
import crypto from 'crypto'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length < 32) throw new Error('ENCRYPTION_KEY env var required (min 32 chars)')
  return Buffer.from(key.slice(0, 32))
}

export function encryptString(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptString(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
```

**Use the existing project helper if one is found.** Only introduce these locally if the project doesn't already have a centralized one.

- [ ] **Step 2: Add OAuth exchange and storage helpers**

Append to `src/lib/canva.ts`:

```ts
import { createServiceClient } from '@/lib/supabase/server'

const CANVA_TOKEN_ENDPOINT = 'https://api.canva.com/rest/v1/oauth/token'
const CANVA_AUTHORIZE_ENDPOINT = 'https://www.canva.com/api/oauth/authorize'

export function getCanvaAuthorizeUrl(state: string): string {
  const clientId = process.env.CANVA_CLIENT_ID
  if (!clientId) throw new Error('CANVA_CLIENT_ID env var not configured')
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/canva/callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'design:content:read design:content:write design:meta:read',
    state,
  })
  return `${CANVA_AUTHORIZE_ENDPOINT}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<CanvaTokens> {
  const clientId = process.env.CANVA_CLIENT_ID
  const clientSecret = process.env.CANVA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Canva OAuth client not configured')
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/canva/callback`

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(CANVA_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canva token exchange failed: ${res.status} ${text}`)
  }

  const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  }
}

export async function storeCanvaTokens(tokens: CanvaTokens): Promise<void> {
  const client = createServiceClient()
  // Use the existing project encryption helper if found in Step 1 — otherwise use local encryptString.
  const rows = [
    { key: 'canva_access_token', value: encryptString(tokens.access_token) },
    { key: 'canva_refresh_token', value: encryptString(tokens.refresh_token) },
    { key: 'canva_token_expires_at', value: tokens.expires_at }, // not sensitive, stored plain
  ]
  for (const row of rows) {
    await client.from('app_settings').upsert(row, { onConflict: 'key' })
  }
}

export async function loadCanvaTokens(): Promise<CanvaTokens | null> {
  const client = createServiceClient()
  const { data } = await client
    .from('app_settings')
    .select('key, value')
    .in('key', ['canva_access_token', 'canva_refresh_token', 'canva_token_expires_at'])
  if (!data || data.length < 3) return null
  const map = Object.fromEntries(data.map((r) => [r.key, r.value]))
  if (!map.canva_access_token || !map.canva_refresh_token || !map.canva_token_expires_at) return null
  return {
    access_token: decryptString(map.canva_access_token),
    refresh_token: decryptString(map.canva_refresh_token),
    expires_at: map.canva_token_expires_at,
  }
}

export async function clearCanvaTokens(): Promise<void> {
  const client = createServiceClient()
  await client.from('app_settings').delete().in('key', [
    'canva_access_token',
    'canva_refresh_token',
    'canva_token_expires_at',
  ])
}

export async function refreshCanvaTokensIfNeeded(): Promise<CanvaTokens | null> {
  const tokens = await loadCanvaTokens()
  if (!tokens) return null
  const expiresAt = new Date(tokens.expires_at)
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000)
  if (expiresAt > fiveMinFromNow) return tokens

  const clientId = process.env.CANVA_CLIENT_ID
  const clientSecret = process.env.CANVA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Canva OAuth client not configured')
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(CANVA_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canva token refresh failed: ${res.status} ${text}`)
  }
  const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  const updated: CanvaTokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  }
  await storeCanvaTokens(updated)
  return updated
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/canva.ts
git commit -m "feat(canva): OAuth code exchange, token storage, and refresh helpers"
```

---

### Task 11: OAuth start + callback routes

**Files:**
- Create: `src/app/api/auth/canva/route.ts` (start — GET redirects to Canva)
- Create: `src/app/api/auth/canva/callback/route.ts`

- [ ] **Step 1: Create the start route**

Write `src/app/api/auth/canva/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { getCanvaAuthorizeUrl } from '@/lib/canva'
import crypto from 'crypto'

export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const url = getCanvaAuthorizeUrl(state)

  const response = NextResponse.redirect(url)
  response.cookies.set('canva_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 min
    path: '/',
  })
  return response
}
```

- [ ] **Step 2: Create the callback route**

Write `src/app/api/auth/canva/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdmin, AuthError } from '@/lib/auth'
import { exchangeCodeForTokens, storeCanvaTokens } from '@/lib/canva'

export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieStore = cookies()
  const expectedState = cookieStore.get('canva_oauth_state')?.value

  if (!code) {
    return NextResponse.redirect(new URL('/settings?canva=missing_code', request.url))
  }
  if (!state || state !== expectedState) {
    return NextResponse.redirect(new URL('/settings?canva=state_mismatch', request.url))
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    await storeCanvaTokens(tokens)
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : 'unknown')
    return NextResponse.redirect(new URL(`/settings?canva=error&msg=${msg}`, request.url))
  }

  const response = NextResponse.redirect(new URL('/settings?canva=connected', request.url))
  response.cookies.delete('canva_oauth_state')
  return response
}
```

- [ ] **Step 3: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: builds cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/canva/route.ts src/app/api/auth/canva/callback/route.ts
git commit -m "feat(canva): OAuth start and callback routes"
```

---

### Task 12: Settings page — Canva connection section

**Files:**
- Modify: `src/app/(admin)/settings/page.tsx`
- Create: `src/components/features/canva-connect.tsx`

- [ ] **Step 1: Create the client component**

Write `src/components/features/canva-connect.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface CanvaConnectProps {
  connected: boolean
}

export function CanvaConnect({ connected }: CanvaConnectProps) {
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleDisconnect() {
    if (!confirm('Disconnect Canva? You will need to reconnect to update designs.')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/auth/canva', { method: 'DELETE' })
      if (!res.ok) throw new Error('Disconnect failed')
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="flex items-center justify-between rounded-[10px] border border-border p-4">
      <div>
        <p className="text-sm font-semibold">Canva</p>
        <p className="text-xs text-muted-foreground">
          {connected
            ? 'Connected. Code updates will sync to apartment guides.'
            : 'Connect your Canva account so apartment code changes update the guides automatically.'}
        </p>
      </div>
      {connected ? (
        <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </Button>
      ) : (
        <a href="/api/auth/canva">
          <Button>Connect Canva</Button>
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add DELETE handler to the start route**

Append to `src/app/api/auth/canva/route.ts`:

```ts
import { clearCanvaTokens } from '@/lib/canva'

export async function DELETE() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await clearCanvaTokens()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Wire into settings page**

In `src/app/(admin)/settings/page.tsx`, add an import and a `<section>` block matching the existing sections (Gmail, Lodgify, etc.):

```tsx
import { CanvaConnect } from '@/components/features/canva-connect'
import { loadCanvaTokens } from '@/lib/canva'

// inside SettingsPage(), before return:
let canvaConnected = false
try {
  const tokens = await loadCanvaTokens()
  canvaConnected = !!tokens
} catch {
  canvaConnected = false
}

// inside the JSX, add a new section (after Lodgify or wherever fits the page order):
<section>
  <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
    Canva Integration
  </p>
  <CanvaConnect connected={canvaConnected} />
</section>
```

Also add a top-of-page toast banner if a `canva=connected|error|state_mismatch|missing_code` query param is present:

```tsx
// Read search params via the page's props or client-side; simplest:
// add a small client component that reads useSearchParams and surfaces a toast.
```

Create `src/components/features/canva-status-toast.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

export function CanvaStatusToast() {
  const params = useSearchParams()
  const status = params.get('canva')
  useEffect(() => {
    if (status === 'connected') toast.success('Canva connected')
    else if (status === 'state_mismatch') toast.error('Canva: state mismatch — please retry')
    else if (status === 'missing_code') toast.error('Canva: missing code in callback')
    else if (status === 'error') toast.error(`Canva: ${params.get('msg') ?? 'connection error'}`)
  }, [status, params])
  return null
}
```

Import and render `<CanvaStatusToast />` inside the settings page wrapped in `<Suspense>`.

- [ ] **Step 4: Manual test — connect flow**

Set local env: add `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, and ensure `NEXT_PUBLIC_APP_URL=http://localhost:3000` in `.env.local`.

Run: `npm run dev`
Open `/settings`, scroll to Canva section, click "Connect Canva" → should redirect to Canva login → approve → redirect back to `/settings?canva=connected` with a success toast.

- [ ] **Step 5: Commit**

```bash
git add src/components/features/canva-connect.tsx src/components/features/canva-status-toast.tsx src/app/\(admin\)/settings/page.tsx src/app/api/auth/canva/route.ts
git commit -m "feat(settings): Canva connect/disconnect UI in settings page"
```

---

### Task 13: `lib/canva.ts` — MCP call wrapper for design update

**Files:**
- Modify: `src/lib/canva.ts`

This wraps the Anthropic Messages API call that talks to Canva via MCP. Mirrors the prompt from Ariel's skill but runs server-side with our OAuth token.

- [ ] **Step 1: Confirm Anthropic SDK is present**

Run: `grep -l "@anthropic-ai/sdk" package.json`
Expected: package.json contains the dependency.

If not present, install: `npm install @anthropic-ai/sdk`

- [ ] **Step 2: Append the MCP call wrapper to lib/canva.ts**

```ts
import Anthropic from '@anthropic-ai/sdk'

export interface UpdateDesignCodesInput {
  designId: string
  designName: string
  newApartmentCode?: string
  newBuildingCode?: string
  accessToken: string
}

export interface UpdateDesignResult {
  success: boolean
  message: string
}

export async function updateCanvaDesignCodes(input: UpdateDesignCodesInput): Promise<UpdateDesignResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var not configured')

  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = `You are an agent that updates codes in Canva apartment guides.
You have access to the Canva MCP.
Given a design ID and one or both new codes to update:
1. Call get-design-content with the design_id to read the current text
2. Find the current values for any codes that need updating (look for "Apartment codes:" and "Building code:" labels on the check-in page)
3. Call start-editing-transaction with the design_id
4. For each code that needs updating, use find_and_replace_text operation via perform-editing-operations to replace the old value with the new one
5. Call commit-editing-transaction to save
Respond ONLY with JSON: {"success": true/false, "message": "..."}`

  const userMessage = `Update codes in Canva design "${input.designId}" (${input.designName}).
${input.newApartmentCode ? `Set the apartment code to: "${input.newApartmentCode}" — find the current value after the label "Apartment codes:" and replace it.` : ''}
${input.newBuildingCode ? `Set the building code to: "${input.newBuildingCode}" — find the current value after the label "Building code:" and replace it.` : ''}
Only update the fields listed above.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    // @ts-expect-error — mcp_servers is a supported Messages API param not yet typed in the SDK
    mcp_servers: [
      {
        type: 'url',
        url: 'https://mcp.canva.com/mcp',
        name: 'canva',
        authorization_token: input.accessToken,
      },
    ],
  } as Parameters<typeof anthropic.messages.create>[0])

  const fullText = response.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const match = fullText.match(/\{[\s\S]*\}/)
  if (!match) return { success: false, message: fullText || 'No JSON in response' }
  try {
    const parsed = JSON.parse(match[0]) as { success: boolean; message: string }
    return parsed
  } catch {
    return { success: false, message: 'Failed to parse JSON response' }
  }
}
```

**Note on model ID:** the user's global CLAUDE.md requires verifying the current strongest Claude model before committing a model ID. Before merging, web-check `https://docs.anthropic.com/en/docs/about-claude/models/overview` or `https://api.anthropic.com/v1/models` and update `'claude-sonnet-4-5'` to the current Sonnet flagship if newer. Sonnet is the right tier (cheap, fast, tool-use-capable). Do not use Opus here.

- [ ] **Step 3: Commit**

```bash
git add src/lib/canva.ts
git commit -m "feat(canva): MCP call wrapper for design code updates via Anthropic Messages API"
```

---

### Task 14: `/api/codes/update` route and `/api/codes/jobs/[id]` poller

**Files:**
- Create: `src/app/api/codes/update/route.ts`
- Create: `src/app/api/codes/jobs/[id]/route.ts`

- [ ] **Step 1: Create the update route**

Write `src/app/api/codes/update/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { refreshCanvaTokensIfNeeded, parseCanvaDesignId, updateCanvaDesignCodes } from '@/lib/canva'

export async function POST(request: Request) {
  let user
  try {
    user = await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as {
    apartment_code?: string
    building_code?: string
    property_ids: string[]
    update_canva: boolean
  }

  if (!body.property_ids?.length) {
    return NextResponse.json({ error: 'property_ids required' }, { status: 400 })
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
      update_canva: body.update_canva,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? 'failed to create job' }, { status: 500 })
  }

  // Kick off processing async (don't await). Edge runtime would need streaming; use Node runtime.
  void processJob(job.id, body).catch(() => { /* errors persisted to job row */ })

  return NextResponse.json({ job_id: job.id })
}

async function processJob(
  jobId: string,
  input: { apartment_code?: string; building_code?: string; property_ids: string[]; update_canva: boolean },
) {
  const service = createServiceClient()
  const results: Record<string, { db: string; canva: string; message: string }> = {}

  // Load Canva tokens once (if enabled).
  let canvaTokens = null
  if (input.update_canva) {
    try {
      canvaTokens = await refreshCanvaTokensIfNeeded()
    } catch (err) {
      canvaTokens = null
    }
  }

  for (const propertyId of input.property_ids) {
    const result = { db: 'failed', canva: 'skipped', message: '' }

    // DB update
    const updates: Record<string, string> = {}
    if (input.apartment_code) updates.entry_code = input.apartment_code
    if (input.building_code) updates.building_entry_code = input.building_code

    const { data: property, error: updateErr } = await service
      .from('properties')
      .update(updates)
      .eq('id', propertyId)
      .select('name, canva_design_url')
      .single()

    if (updateErr || !property) {
      result.message = updateErr?.message ?? 'property not found'
      results[propertyId] = result
      await persistResults(jobId, results)
      continue
    }
    result.db = 'ok'

    // Canva update
    if (input.update_canva && canvaTokens) {
      const designId = parseCanvaDesignId(property.canva_design_url)
      if (!designId) {
        result.canva = 'skipped'
        result.message = result.message || 'No Canva design linked'
      } else {
        try {
          const canvaResult = await updateCanvaDesignCodes({
            designId,
            designName: property.name,
            newApartmentCode: input.apartment_code,
            newBuildingCode: input.building_code,
            accessToken: canvaTokens.access_token,
          })
          result.canva = canvaResult.success ? 'ok' : 'failed'
          result.message = canvaResult.message
        } catch (err) {
          result.canva = 'failed'
          result.message = err instanceof Error ? err.message : 'Canva call failed'
        }
      }
    } else if (input.update_canva && !canvaTokens) {
      result.canva = 'skipped'
      result.message = 'Canva not connected. Go to Settings → Canva.'
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

- [ ] **Step 2: Create the polling route**

Write `src/app/api/codes/jobs/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('code_update_jobs')
    .select('status, results, started_at, completed_at')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  return NextResponse.json(data)
}
```

- [ ] **Step 3: Confirm `requireAdmin` returns the user object**

Run: `grep -n "export.*requireAdmin\|export.*function requireAdmin" src/lib/auth.ts`
Read the function to confirm it returns the user (with `.id`). If it doesn't, in Task 14 Step 1 the line `let user = await requireAdmin()` should be replaced with a separate `auth.getUser()` call to grab the user ID.

- [ ] **Step 4: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: builds cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/codes/update/route.ts src/app/api/codes/jobs/\[id\]/route.ts
git commit -m "feat(codes): job-backed code update endpoint and polling endpoint"
```

---

### Task 15: Admin `/codes` page

**Files:**
- Create: `src/app/(admin)/codes/page.tsx`
- Create: `src/components/features/code-update-form.tsx`

- [ ] **Step 1: Create the server page**

Write `src/app/(admin)/codes/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { CodeUpdateForm } from '@/components/features/code-update-form'
import { loadCanvaTokens, parseCanvaDesignId } from '@/lib/canva'

export default async function CodesPage() {
  const service = createServiceClient()
  const { data: properties } = await service
    .from('properties')
    .select('id, name, canva_design_url, entry_code, building_entry_code')
    .order('name')

  const canvaConnected = !!(await loadCanvaTokens().catch(() => null))

  const enriched = (properties ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    entry_code: p.entry_code,
    building_entry_code: p.building_entry_code,
    has_canva: !!parseCanvaDesignId(p.canva_design_url),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Update Codes</h1>
        <p className="text-xs text-muted-foreground">
          Change apartment or building entry codes. Canva guides update automatically when connected.
        </p>
      </div>
      <CodeUpdateForm properties={enriched} canvaConnected={canvaConnected} />
    </div>
  )
}
```

- [ ] **Step 2: Create the client form**

Write `src/components/features/code-update-form.tsx`:

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
  has_canva: boolean
}

interface JobResult {
  status: 'running' | 'done'
  results: Record<string, { db: string; canva: string; message: string }>
}

interface CodeUpdateFormProps {
  properties: PropertyOption[]
  canvaConnected: boolean
}

export function CodeUpdateForm({ properties, canvaConnected }: CodeUpdateFormProps) {
  const [apartmentCode, setApartmentCode] = useState('')
  const [buildingCode, setBuildingCode] = useState('')
  const [updateCanva, setUpdateCanva] = useState(canvaConnected)
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
          update_canva: updateCanva,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to start update')
      }
      const { job_id } = await res.json() as { job_id: string }
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
          const data = await res.json() as JobResult
          setJob(data)
          if (data.status === 'done') return
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
    poll()
    return () => { cancelled = true }
  }, [jobId])

  function reset() {
    setApartmentCode('')
    setBuildingCode('')
    setSelected(new Set())
    setJobId(null)
    setJob(null)
  }

  // Counts for summary
  const counts = {
    done: 0,
    failed: 0,
  }
  if (job) {
    for (const r of Object.values(job.results)) {
      if (r.db === 'ok' && (r.canva === 'ok' || r.canva === 'skipped')) counts.done++
      else if (r.db === 'failed' || r.canva === 'failed') counts.failed++
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={updateCanva}
                onChange={(e) => setUpdateCanva(e.target.checked)}
                disabled={!canvaConnected}
              />
              Update Canva guide where applicable
              {!canvaConnected && (
                <a href="/settings" className="text-xs text-muted-foreground underline">(Canva not connected)</a>
              )}
            </label>
          </section>

          <section className="rounded-[10px] border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Apartments</p>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setSelected(new Set(properties.map((p) => p.id)))} className="text-muted-foreground hover:text-foreground">All</button>
                <span className="text-muted-foreground">·</span>
                <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground">Clear</button>
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
                  <span className="shrink-0 rounded-[var(--radius-badge)] bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                    {p.has_canva ? 'Canva' : 'No Canva'}
                  </span>
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
              <div><span className="font-semibold text-green-600">{counts.done}</span> done</div>
              <div><span className="font-semibold text-red-600">{counts.failed}</span> failed</div>
              <div><span className="text-muted-foreground">{Array.from(selected).length - counts.done - counts.failed}</span> remaining</div>
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
                      {r?.message || (r ? `DB ${r.db} · Canva ${r.canva}` : 'Queued...')}
                    </p>
                  </div>
                  <StatusPill r={r} />
                </div>
              )
            })}
          </section>

          {job?.status === 'done' && (
            <Button onClick={reset} className="w-full">Start new update</Button>
          )}
        </>
      )}
    </div>
  )
}

function StatusPill({ r }: { r: { db: string; canva: string; message: string } | undefined }) {
  if (!r) return <span className="text-[11px] text-muted-foreground">Queued</span>
  const failed = r.db === 'failed' || r.canva === 'failed'
  const done = r.db === 'ok'
  if (failed) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">Failed</span>
  if (done) return <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Done</span>
  return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Updating...</span>
}
```

- [ ] **Step 2: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/codes/page.tsx src/components/features/code-update-form.tsx
git commit -m "feat(codes): admin page for code updates with progress polling"
```

---

### Task 16: Sidebar nav — add "Codes" entry

**Files:**
- Modify: `src/components/layout/shells/ledger-shell.tsx`

- [ ] **Step 1: Add nav entry**

In `src/components/layout/shells/ledger-shell.tsx`, find the admin nav array (lines 44–55 currently). Add a new entry **after** the "Properties" line:

```tsx
{ href: '/codes', label: 'Codes', icon: KeyRound },
```

Import `KeyRound` from `lucide-react` at the top of the file (add it to the existing `lucide-react` import).

- [ ] **Step 2: Manual verify**

Run: `npm run dev`
Open `/dashboard`, confirm "Codes" appears in the sidebar under "Properties".

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/shells/ledger-shell.tsx
git commit -m "feat(nav): add Codes sidebar entry under Properties"
```

---

## Phase 3 — Final wire-up

### Task 17: `.env.example` updates

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add new env vars**

Append to `.env.example`:

```
# Canva OAuth (Section B: code update workflow)
CANVA_CLIENT_ID=your-canva-client-id
CANVA_CLIENT_SECRET=your-canva-client-secret

# Anthropic API (Section B: also used for bill parsing if applicable)
ANTHROPIC_API_KEY=your-anthropic-key
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document CANVA_CLIENT_ID/SECRET and ANTHROPIC_API_KEY"
```

---

### Task 18: Manual smoke test (end-to-end)

This is a verification task, not a code task. Run through each flow before opening a PR.

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: all tests pass (including the 7 new magic-links tests and 4 new canva tests added in Tasks 4 and 9).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Manual flow — guest magic link with delayed reveal**

a. Set `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `ANTHROPIC_API_KEY` in `.env.local`. Make sure `MAGIC_LINK_SECRET` and Supabase keys are already set.

b. `npm run dev`, open `/properties/<some-id>`, click "Generate Magic Link" → "Guest".

c. Fill: reveal in 0 days (or check "Reveal immediately"), expires in 1 day. Generate. Visit the URL.
**Expected:** code visible immediately, page renders fully.

d. Generate a second link: reveal in 1 day, expires in 7 days.
**Expected:** API response includes `code_reveals_at` and `expires_at` as ISO timestamps. Visit the URL — code area is hidden / blanked out. Verify via DB that the row has both timestamps populated.

e. Manually update DB to set `code_reveals_at` to a past time. Refresh the guest page (no soft reload).
**Expected:** code now appears, proving the PWA cache fix is working.

- [ ] **Step 4: Manual flow — Canva OAuth + code update**

a. `/settings` → click "Connect Canva" → approve in Canva → land on `/settings?canva=connected` with toast.
**Expected:** "Disconnect" button now shows.

b. Open `/codes`. Enter apartment code "TEST1234". Pick one apartment that has a Canva design linked. Click "Update".
**Expected:** progress page shows; after a few seconds, the entry shows "Done"; verify DB `properties.entry_code` is "TEST1234"; verify the Canva design's "Apartment codes:" line was updated.

c. Repeat with an apartment that has no Canva URL.
**Expected:** "Done" pill, message reads "No Canva design linked" or similar; DB updated; no Canva call attempted.

d. Disconnect Canva via settings. Try a code update again with "Update Canva" still checked.
**Expected:** DB updates succeed; Canva column shows "Skipped" with message about reconnecting.

- [ ] **Step 5: If all flows pass, push and open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: guest link expiry controls + Canva-integrated code update workflow" --body "$(cat <<'EOF'
## Summary

- Guest magic links now have admin-configurable reveal (7am Jerusalem on day N) and expiry (11:59pm Jerusalem on day N), decoupled from bookings.
- New /codes admin page updates apartment/building codes in ApartmentOS and pushes to Canva guides via OAuth + Anthropic Messages API with Canva MCP.
- PWA cache no longer serves stale guest/contractor pages, so DB code changes appear on refresh.

## Test plan

- [ ] Generate guest link with delayed reveal, verify code hidden then revealed
- [ ] Generate guest link with "never expires", verify it works after JWT-default expiry would have hit
- [ ] Connect Canva OAuth via /settings
- [ ] Run a code update against an apartment with a Canva design, verify both DB and Canva updated
- [ ] Run a code update with Canva disconnected, verify DB-only updates succeed with skip messages
- [ ] Refresh a guest page after DB code change, verify new code shows (PWA cache fix)
EOF
)"
```

---

## Self-Review

**Spec coverage:** All sections of the spec are mapped to tasks:
- §A UI form → Task 8
- §A API → Task 5
- §A DB migration → Task 2
- §A guest page + force-dynamic → Tasks 1, 6
- §A PWA fix → Task 1
- §A email body → Task 7
- §B admin page → Task 15 + nav in Task 16
- §B `/api/codes/update` + job table → Tasks 3, 14
- §B Canva OAuth → Tasks 10, 11
- §B Canva connect UI → Task 12
- §B MCP call → Task 13
- §B design ID parser → Task 9
- Env vars → Task 17
- Verification → Task 18

**Placeholder scan:** No "TBD" or "implement later" remain. The Anthropic model ID note in Task 13 is a deliberate runtime check (model IDs change), not a placeholder.

**Type consistency:**
- `computeRevealAt` / `computeExpiresAt` / `validateRevealAndExpiry` exported in Task 4, imported in Tasks 5 and 8 — names match.
- `CanvaTokens` defined Task 9, used in Task 10. Match.
- `parseCanvaDesignId` defined Task 9, used in Tasks 14, 15. Match.
- `loadCanvaTokens`, `clearCanvaTokens`, `storeCanvaTokens`, `refreshCanvaTokensIfNeeded`, `getCanvaAuthorizeUrl`, `exchangeCodeForTokens`, `updateCanvaDesignCodes` all defined in Tasks 10/13 and consumed in 11/12/14/15. Match.
- `UpdateDesignCodesInput` field `newApartmentCode` matches the consumer's `apartmentCode` mapping in Task 14.

**Open dependencies for the engineer to handle inline:**
- Task 10 Step 1 assumes the engineer searches for an existing project encryption helper; only fall back to the local one if none exists.
- Task 13 references model ID — engineer should web-check before committing.
- Task 14 Step 3 verifies `requireAdmin()` return shape; if it doesn't return user, use `getSession()` instead.
