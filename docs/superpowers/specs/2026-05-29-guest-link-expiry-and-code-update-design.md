# Guest Link Expiry Controls & Code Update Workflow

**Date:** 2026-05-29
**Author:** brainstormed with Yitzy from Ariel feedback
**Status:** Approved (pending spec review)

## Background

Two pieces of client feedback from Ariel surfaced in May:

1. **Guest magic links are too rigid.** Default expiry is 72h from creation. Reveal is gated to 24h before booking check-in — but only if a booking is attached to the link. Today the magic-link generator UI does not let him attach a booking, so every link shows the code immediately on first open. He also can't send a link days in advance because the JWT expires before the guest arrives. Ariel rejected booking-based gating because some clients (homeowners) generate links without a booking at all.

2. **Code changes are split across two systems.** When an apartment or building code changes, he must edit it on each property in ApartmentOS *and* hand-edit each Canva guide. A Canva-only skill exists in his personal Claude account ([SKILL.md](.tmp/marcus-skill/marcus-code-agent-skill/SKILL.md)) but does not touch ApartmentOS.

This spec covers both. A third bug — PWA service worker caching the guest page so manual DB code changes don't appear on refresh — is bundled because it touches the same files and would otherwise undermine the Section A behavior.

## Goals

- Admin can set per-link reveal and expiry windows when generating guest magic links.
- Admin can change apartment or building codes in one workflow and have ApartmentOS DB + Canva guide updated together.
- PWA cache no longer hides DB updates to entry codes from guests on the magic link page.

## Non-goals

- Booking attachment for guest magic links. Decided out for now; some clients don't book.
- Notification to in-stay guests when a code changes. Ariel said this is rare (twice ever) and he'll manually message them.
- Code history / audit log. Ariel said not needed.
- Guest portal — code page is unchanged in design, only the reveal logic shifts.

---

## Section A — Guest Magic Link Expiry & Reveal Controls

### UI: `src/components/features/magic-link-generator.tsx`

When the user picks **Guest Check-in Link**, the existing immediate `generate('guest')` call is replaced with a two-section form.

```
┌─ Code reveal ─────────────────────────┐
│ [ ] Reveal immediately                │
│ Reveal in [   ] days                  │
│   → Fri May 31, 2026 · 7:00 AM        │
└───────────────────────────────────────┘

┌─ Link expiry ─────────────────────────┐
│ [ ] Never expires                     │
│ Expires in [   ] days                 │
│   → Wed Jun 4, 2026 · 11:59 PM        │
└───────────────────────────────────────┘

[ Generate Link ]   ← disabled until both choices made
```

**Field rules**

- Reveal days: `number` input, min `0`, max `30`. `0` is allowed but the "Reveal immediately" checkbox is the recommended way to express it. When checked, the days input is disabled and the resolved-time line reads "Code reveals immediately on first open."
- Expiry days: same input shape. "Never expires" checkbox disables the days input. Resolved-time line reads "Link never expires."
- Generate button stays disabled until **both** sections have a resolved value (either a days number or a checkbox).
- Resolved time displayed under each field updates live as the user types, computed in browser using `Asia/Jerusalem` timezone.

**Time-of-day rules**

- Reveal time: **07:00 Jerusalem** on day N. Day 0 = "immediately" (no waiting at all).
- Expiry time: **23:59:59 Jerusalem** on day M.
- Both computed client-side as absolute ISO timestamps before submission, so server doesn't redo timezone math.

### API: `src/app/api/magic-links/route.ts`

**Replaces** `expires_in_hours: number` with:

```ts
{
  // ...existing fields,
  code_reveals_at: string | null   // ISO timestamp; null = reveal immediately
  expires_at: string | null        // ISO timestamp; null = never expires
}
```

**JWT change.** Today the JWT `exp` claim is the source of truth for expiry. With nullable expiry, the source of truth must move to the DB row. The route:

- If `expires_at` is provided, sign JWT with `setExpirationTime(expires_at)`.
- If `expires_at` is null, sign JWT with a 10-year expiry (so `jwtVerify` doesn't reject). The `magic_links.expires_at IS NULL` row tells the guest page "never expires."
- `verifyMagicLinkToken` is unchanged. The guest page does an additional DB check (below) to enforce expiry beyond the JWT.

**Email behavior.** The existing `send_email` flag stays. The guest check-in email body should include "Your entry code will appear on `<reveal date>` at 7:00 AM" when `code_reveals_at` is in the future, otherwise unchanged. Implemented in [src/lib/email.ts:sendGuestCheckInLink](src/lib/email.ts) by accepting an optional `codeRevealsAt` arg.

**Validation:**

- Reject if both `code_reveals_at` and `expires_at` are set and `code_reveals_at > expires_at`.
- Reject if `expires_at` is in the past.

### DB: new migration `00050_magic_link_reveal_expiry.sql`

```sql
ALTER TABLE magic_links
  ALTER COLUMN expires_at DROP NOT NULL,
  ADD COLUMN code_reveals_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN magic_links.code_reveals_at IS
  'Server-side time gate for revealing entry_code on the guest page. NULL = reveal immediately.';
COMMENT ON COLUMN magic_links.expires_at IS
  'When the link stops working. NULL = never expires.';
```

No backfill needed — existing rows keep their `expires_at`, new column starts NULL.

### Guest page: `src/app/guest/[token]/page.tsx`

Two changes to the load logic:

1. **Use the magic_links row as source of truth.** After `verifyMagicLinkToken`:
   - If `magicLink.expires_at` is non-null and `new Date() > new Date(magicLink.expires_at)` → render the existing "Invalid Link" expired state.
   - `entryCode = magicLink.code_reveals_at === null || new Date() >= new Date(magicLink.code_reveals_at) ? property.entry_code : null`.

2. **Remove booking-based reveal.** The existing block at lines 53–61 (`gateOpens = check_in - 24h`) is deleted. Booking lookup stays only for displaying `guest_name`, `check_in`, `check_out`, `guest_language` in the guide.

Add at top of file:

```ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
```

Same change to [src/app/contractor/[token]/page.tsx](src/app/contractor/[token]/page.tsx) to be safe.

### PWA cache exclusion: `next.config.js`

Replace the current `withPWA({...})` call with explicit `runtimeCaching` that bypasses `/guest/`, `/contractor/`, and `/api/`:

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
```

### Tests

Unit (vitest):

- `magic-links.test.ts`: extend to cover the case where `expires_at` is null in DB but JWT has 10y `exp` — `verifyMagicLinkToken` succeeds, but the guest page treats the DB null as "live."
- `magic-links.test.ts`: validation error when `code_reveals_at > expires_at`.

Integration (manual or vitest with mocked supabase):

- Generate a link with reveal_in_days=2, expires_in_days=5 → API responds with both timestamps at 7am and 11:59pm Jerusalem.
- Render guest page when `now < code_reveals_at` → `entryCode` is null in props.
- Render guest page when `now > expires_at` → "Invalid Link" branch.

E2E (Playwright, low priority): not in this PR.

---

## Section B — Code Update Workflow

### Admin page: `src/app/(admin)/codes/page.tsx`

New sidebar entry **Update Codes**, placed under "Properties" (matches the visit management precedent).

Layout:

```
┌─ New Codes ───────────────────────────┐
│ Apartment code   [ 4827      ]        │
│ Building code    [           ] (opt)  │
│ ☑ Update Canva guide where applicable │
└───────────────────────────────────────┘

┌─ Apartments ──────────────────────────┐
│ [Select all] [Clear]                  │
│                                       │
│ ☑ 🌇 Savyon View         🎨 Canva     │
│ ☑ 🏠 Agripas 4 Bedroom   🎨 Canva     │
│ ☐ ✨ 3 Bedroom Dream     🎨 Canva     │
│ ☐ 🕍 Jerusalem Skyline   🎨 Canva     │
│ ☐ Keren Hayesod 3        (no Canva)   │
│ ☐ ...                                 │
└───────────────────────────────────────┘

[ Update 2 Apartments ]
```

**Form rules**

- At least one of `apartment_code` / `building_code` must be filled.
- Submit button disabled until: a code is entered AND ≥1 apartment selected.
- "Canva linked" badge appears for properties where `canva_design_url` is non-null and parseable.
- "Update Canva" checkbox is checked by default; can be unchecked to skip Canva (DB-only update).

**Progress phase** (after submit): mirrors Ariel's skill — status pills per apartment (Queued / Updating / Done / Failed), with summary counts at top. Live updates via Server-Sent Events or polling — see implementation note.

### API: `POST /api/codes/update`

Request:

```ts
{
  apartment_code?: string
  building_code?: string
  property_ids: string[]
  update_canva: boolean
}
```

Response: `{ job_id: string }`. Client polls `GET /api/codes/jobs/:id` every 1s. Polling returns:

```ts
{
  status: 'running' | 'done'
  results: Record<string, { db: 'ok' | 'failed', canva: 'ok' | 'skipped' | 'failed', message: string }>
  started_at: string
  completed_at: string | null
}
```

Status job record stored in a new `code_update_jobs` table (see below).

For each property in the job:

1. Update `properties.entry_code` (if `apartment_code` provided) and/or `properties.building_entry_code` (if `building_code` provided).
2. If `update_canva` AND `property.canva_design_url` AND Canva OAuth token present in `app_settings`:
   - Parse design ID from URL (regex `/design/([A-Za-z0-9_-]+)/`).
   - Call Anthropic Messages API with `mcp_servers: [{ type: "url", url: "https://mcp.canva.com/mcp", name: "canva", authorization_token: <token> }]`.
   - Use the same prompt skeleton as the skill: get design content, find current value after `"Apartment codes:"` or `"Building code:"` label, find-and-replace.
   - Token refresh handled before call if expired (see OAuth section).
3. Persist per-property result `{ db: 'ok' | 'failed', canva: 'ok' | 'skipped' | 'failed', message: string }` to the job row.

**Error handling:**

- DB update failure → mark property `db: 'failed'`, do not attempt Canva, continue to next.
- Canva update failure → DB stays updated, property marked `canva: 'failed'` with message. The two are not transactional; DB is the source of truth and Ariel can re-run Canva-only.
- ANTHROPIC_API_KEY missing → fail fast with 500.
- Canva token missing → all properties get `canva: 'skipped'` with message "Canva not connected. Go to Settings → Integrations."

### DB: new migration `00051_code_update_jobs.sql`

```sql
CREATE TABLE code_update_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  apartment_code TEXT,
  building_code TEXT,
  property_ids UUID[] NOT NULL,
  update_canva BOOLEAN NOT NULL,
  results JSONB NOT NULL DEFAULT '{}',   -- { [property_id]: { db, canva, message } }
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'done'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE code_update_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on code_update_jobs" ON code_update_jobs FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

The job row persists so polling works across page reloads and so we have light history (not exposed as a feature, but useful for debugging).

### Canva OAuth: `src/app/(admin)/settings/integrations/page.tsx`

New settings sub-page.

- "Connect Canva" button → redirects to `https://www.canva.com/api/oauth/authorize?...` with scopes `design:content:read design:content:write`.
- Callback at `/api/auth/canva/callback` exchanges code → access + refresh token, stores three rows in `app_settings`:
  - `canva_access_token` (encrypted)
  - `canva_refresh_token` (encrypted)
  - `canva_token_expires_at` (ISO timestamp, not encrypted)
- Disconnect button deletes the three rows.
- Status display: "Connected as &lt;Canva account email&gt;" once tokens exist (fetched via Canva user profile endpoint on connect, stored as a fourth `canva_account_email` row).

**Token refresh.** Before any Messages API call, check `canva_token_expires_at`. If less than 5min remaining, refresh via `POST https://api.canva.com/rest/v1/oauth/token` with `grant_type=refresh_token`. Update the three rows.

### Property → Canva design ID mapping

Properties already have `canva_design_url`. Parse design ID with `^https?://(?:www\.)?canva\.com/design/([A-Za-z0-9_-]+)/`. No schema change.

For properties without a valid `canva_design_url`, the UI shows "(no Canva)" badge and Canva step is skipped automatically.

### Tests

Unit:

- Design ID parser given the four URLs from the skill.
- Token refresh: returns existing token when valid, refreshes when expiring soon.
- Job result aggregator: combines DB result + Canva result correctly.

Integration:

- Update flow with mocked Anthropic API → job goes `running → done`, per-property results populated.
- Canva token missing → all properties skip Canva.

---

## Implementation order (one PR)

1. Migration `00050_magic_link_reveal_expiry.sql` + `00051_code_update_jobs.sql`.
2. PWA cache fix (`next.config.js` + `dynamic = 'force-dynamic'` on guest/contractor pages). Smallest risk, ships independent value.
3. Section A: API route updates → DB-backed expiry → magic-link-generator UI → email body tweak.
4. Section B: Canva OAuth flow + settings page → `/api/codes/update` job machinery → admin `/codes` page UI.
5. Tests.

## Open risks

- **Canva OAuth app registration.** Marcus Properties needs a Canva developer account and an OAuth app. Yitzy to confirm Marcus has one or to register it. Without it Section B can't ship.
- **Canva MCP tool surface stability.** The skill uses `get-design-content`, `start-editing-transaction`, `perform-editing-operations`, `commit-editing-transaction`, `find_and_replace_text`. If Canva renames any of these, Section B breaks silently. Worth pinning a sanity test that asserts the agent returned `success: true` for a known design in CI smoke (manual for now).
- **PWA cache fix on existing user devices.** Existing service worker still caches `/guest/` until the SW updates. `skipWaiting: true` means new SW activates ASAP, but devices may need one extra refresh. Acceptable.
- **Anthropic API key cost.** Each property update is one Messages call with MCP tool round-trips. Sonnet 4 at ~$3/M input + ~$15/M output, maybe $0.01–0.05 per apartment. With 20 properties and infrequent code changes, negligible.

## Files touched

- `src/components/features/magic-link-generator.tsx` (form rewrite)
- `src/app/api/magic-links/route.ts` (new params)
- `src/app/guest/[token]/page.tsx` (DB-backed gate, force-dynamic)
- `src/app/contractor/[token]/page.tsx` (force-dynamic)
- `src/lib/email.ts` (optional reveal date in guest email)
- `src/lib/magic-links.ts` (no change expected, but verify)
- `src/lib/magic-links.test.ts` (extend)
- `next.config.js` (PWA exclusions)
- `src/app/(admin)/codes/page.tsx` (NEW)
- `src/app/(admin)/settings/integrations/page.tsx` (NEW)
- `src/app/api/codes/update/route.ts` (NEW)
- `src/app/api/codes/jobs/[id]/route.ts` (NEW)
- `src/app/api/auth/canva/callback/route.ts` (NEW)
- `src/lib/canva.ts` (NEW — design ID parser, token refresh, Anthropic call helper)
- `supabase/migrations/00050_magic_link_reveal_expiry.sql` (NEW)
- `supabase/migrations/00051_code_update_jobs.sql` (NEW)
