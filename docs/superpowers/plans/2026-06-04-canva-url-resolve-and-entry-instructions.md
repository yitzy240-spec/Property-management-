# Canva URL Resolution + Per-Apartment Entry Instructions — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Accept any Canva share link (including `canva.link` short links) by normalizing it to a canonical public-view URL on save, and add a native per-apartment "Entry instructions" field shown on the guest page under the live code.

**Architecture:** A server-side `resolveCanvaDesignUrl()` follows a short link's redirect to extract the design id and stores a canonical `…/design/<id>/view` URL; the property save actions call it. A new `properties.entry_instructions` column is edited in the admin property form and rendered natively on the guest page (taking priority over the embed/generic fallback).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, Tailwind, vitest/@testing-library/react.

**Follows:** `docs/superpowers/specs/2026-06-04-app-native-guest-guide-design.md` (this is a refinement after live testing: Ariel pasted `https://canva.link/honh3op06pgtcpk`, which 301-redirects to `…/design/DAHCHqRRpzI/…/edit`; the short link has no id, so the parser saw "no Canva", and the per-apartment instructions can't be read out of Canva so they must be app-native).

---

## File Structure
- `src/lib/canva.ts` — add `resolveCanvaDesignUrl()` (async).
- `src/lib/canva.test.ts` — add resolver tests.
- `src/app/(admin)/properties/actions.ts` — normalize `canva_design_url` in `createProperty`/`updateProperty`.
- `supabase/migrations/00032_property_entry_instructions.sql` — new column.
- `src/components/features/property-form.tsx` — entry-instructions textarea + data field + Canva field copy.
- `src/app/guest/[token]/page.tsx` — select `entry_instructions`.
- `src/components/features/guest-check-in.tsx` — render entry instructions (priority).
- `src/components/features/guest-check-in.test.tsx` — test + fixture update.

---

## Task A: `resolveCanvaDesignUrl` resolver

**Files:** Modify `src/lib/canva.ts`; Test `src/lib/canva.test.ts`.

- [ ] **Step 1: Write the failing tests** — append to `src/lib/canva.test.ts`, and add `resolveCanvaDesignUrl` to the existing import from `./canva`. Also add `vi, afterEach` to the existing `vitest` import if not present:

```ts
describe('resolveCanvaDesignUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('canonicalizes a direct design link without any network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await resolveCanvaDesignUrl('https://www.canva.com/design/DAGmTDKfFrI/abc/edit?x=1'))
      .toBe('https://www.canva.com/design/DAGmTDKfFrI/view')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null for empty/null input', async () => {
    expect(await resolveCanvaDesignUrl(null)).toBeNull()
    expect(await resolveCanvaDesignUrl('   ')).toBeNull()
  })

  it('resolves a canva.link short link via its redirect Location header', async () => {
    const fetchMock = vi.fn(async () => ({
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'location'
            ? 'https://www.canva.com/design/DAHCHqRRpzI/tok/edit?utm_content=DAHCHqRRpzI'
            : null,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await resolveCanvaDesignUrl('https://canva.link/honh3op06pgtcpk'))
      .toBe('https://www.canva.com/design/DAHCHqRRpzI/view')
  })

  it('keeps the original link if the redirect cannot be resolved to an id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ headers: { get: () => null } })))
    expect(await resolveCanvaDesignUrl('https://canva.link/unknown')).toBe('https://canva.link/unknown')
  })

  it('keeps the original link if the network call throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await resolveCanvaDesignUrl('https://canva.link/down')).toBe('https://canva.link/down')
  })
})
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run src/lib/canva.test.ts` → FAIL (`resolveCanvaDesignUrl` not exported).

- [ ] **Step 3: Implement** — append to `src/lib/canva.ts`:

```ts
/**
 * Normalize any Canva share URL to a canonical public-view link
 * (https://www.canva.com/design/<id>/view) so the parser + embed work.
 * Direct design links resolve synchronously; short links (canva.link/...) are
 * resolved by following the redirect and reading the design id from Location.
 * Returns the original input unchanged when no design id can be determined,
 * and null for empty input. Server-side only (performs a network request).
 */
export async function resolveCanvaDesignUrl(input: string | null): Promise<string | null> {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const directId = parseCanvaDesignId(trimmed)
  if (directId) return `https://www.canva.com/design/${directId}/view`

  try {
    const res = await fetch(trimmed, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
    const resolvedId = parseCanvaDesignId(res.headers.get('location'))
    if (resolvedId) return `https://www.canva.com/design/${resolvedId}/view`
  } catch {
    // Network/timeout failure — fall through and keep the original input.
  }
  return trimmed
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/lib/canva.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/canva.ts src/lib/canva.test.ts
git commit -m "feat(canva): resolveCanvaDesignUrl normalizes short/edit links to a view URL"
```

---

## Task B: Normalize `canva_design_url` on save

**Files:** Modify `src/app/(admin)/properties/actions.ts`.

- [ ] **Step 1: Add the import** — add to the top imports of `actions.ts`:
```ts
import { resolveCanvaDesignUrl } from '@/lib/canva'
```

- [ ] **Step 2: Normalize in `createProperty`** — in `createProperty`, immediately after the `if (!user) throw new Error('Unauthorized')` line and before `const serviceClient = createServiceClient()`, insert:
```ts
  if ('canva_design_url' in data) {
    data.canva_design_url = await resolveCanvaDesignUrl(data.canva_design_url as string | null)
  }
```

- [ ] **Step 3: Normalize in `updateProperty`** — add the same block in `updateProperty`, in the same position (after the auth check, before `createServiceClient()`):
```ts
  if ('canva_design_url' in data) {
    data.canva_design_url = await resolveCanvaDesignUrl(data.canva_design_url as string | null)
  }
```

- [ ] **Step 4: Type-check + commit**
```bash
npx tsc --noEmit   # expect exit 0
git add "src/app/(admin)/properties/actions.ts"
git commit -m "feat(properties): normalize Canva guide URL on save (resolve short links)"
```

---

## Task C: Migration + entry-instructions admin field

**Files:** Create `supabase/migrations/00032_property_entry_instructions.sql`; Modify `src/components/features/property-form.tsx`.

- [ ] **Step 1: Create the migration** — `supabase/migrations/00032_property_entry_instructions.sql`:
```sql
-- Per-apartment entry instructions, shown natively on the guest page under the live code.
ALTER TABLE properties ADD COLUMN entry_instructions TEXT;
COMMENT ON COLUMN properties.entry_instructions IS 'Apartment-specific entry steps shown to guests under their entry code.';
```

- [ ] **Step 2: Add `entry_instructions` to the submitted data** — in `property-form.tsx` `handleSubmit`, add a line immediately after the `canva_design_url:` line in the `data` object:
```ts
      entry_instructions: formData.get('entry_instructions') as string || null,
```

- [ ] **Step 3: Add the textarea field** — insert this block immediately AFTER the existing Building Code field `<div>` (the one containing `<Input id="building_entry_code" …/>`), as a new sibling:
```tsx
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="entry_instructions" className="text-xs font-medium">Entry instructions</Label>
                <textarea
                  id="entry_instructions"
                  name="entry_instructions"
                  rows={3}
                  placeholder="Apartment-specific steps, e.g. 'Enter the building code, take the lift to floor 3, then turn right.'"
                  defaultValue={property?.entry_instructions ?? ''}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">Shown to guests under their entry code, on the guest check-in page.</p>
              </div>
```

- [ ] **Step 4: Fix the Canva field copy** (it currently mislabels the field as an "Image URL"). Replace the Canva `<Input>` and its helper `<p>`:
```tsx
              <Input id="canva_design_url" name="canva_design_url" type="url" placeholder="https://canva.com/design/... or canva.link/..." defaultValue={property?.canva_design_url ?? ''} className="h-11" />
              <p className="text-xs text-muted-foreground">Paste any Canva share link (short links work too) — the guide embeds on the guest page.</p>
```

- [ ] **Step 5: Type-check** — `npx tsc --noEmit`. If TypeScript reports that `property?.entry_instructions` is not on the form's `property` prop type, find the `property` prop type declared in `property-form.tsx` (the typed object whose other fields include `canva_design_url`) and add `entry_instructions?: string | null` to it. Re-run `npx tsc --noEmit` → expect exit 0.

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/00032_property_entry_instructions.sql src/components/features/property-form.tsx
git commit -m "feat(properties): add per-apartment entry instructions field + clearer Canva URL copy"
```

---

## Task D: Native entry-instructions display on the guest page

**Files:** Modify `src/app/guest/[token]/page.tsx`, `src/components/features/guest-check-in.tsx`, `src/components/features/guest-check-in.test.tsx`.

- [ ] **Step 1: Write the failing test** — in `guest-check-in.test.tsx`:
  - Add `entry_instructions: null,` to the `baseProperty` object.
  - Append this test inside `describe('GuestCheckIn', …)`:
```tsx
  it('shows the apartment-specific entry instructions when present', () => {
    render(
      <GuestCheckIn
        property={{ ...baseProperty, entry_instructions: 'Take the lift to 3, turn right.' }}
        booking={null}
        canvaEmbedUrl={null}
      />,
    )
    expect(screen.getByText('Take the lift to 3, turn right.')).toBeTruthy()
  })
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run src/components/features/guest-check-in.test.tsx` → FAIL (type error: `entry_instructions` missing on the property type / text not found).

- [ ] **Step 3a: Add `entry_instructions` to the property prop type** — in `guest-check-in.tsx`, in the `GuestCheckInProps` `property` object type, after the `canva_design_url: string | null` line, add:
```ts
    entry_instructions: string | null
```

- [ ] **Step 3b: Render instructions with priority** — replace the entire code-instruction paragraph block (the `<p className="mt-3 …">{canvaEmbedUrl ? … }</p>` introduced earlier) with:
```tsx
              {property.entry_instructions ? (
                <p dir="auto" className="mt-3 whitespace-pre-line text-xs text-muted-foreground">
                  {property.entry_instructions}
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {canvaEmbedUrl
                    ? 'Step-by-step entry instructions are in your guide below.'
                    : property.building_entry_code
                      ? 'Use the building code at the main entrance, then the apartment code on the Simplex lock.'
                      : 'Use this code on the Simplex lock at the front door.'}
                </p>
              )}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/components/features/guest-check-in.test.tsx` → all pass.

- [ ] **Step 5: Pass the field from the guest page** — in `src/app/guest/[token]/page.tsx`, add `entry_instructions` to the properties select. Change:
```ts
      .select('name, address, neighborhood, city, entry_code, building_entry_code, youtube_tutorial_url, canva_design_url')
```
to:
```ts
      .select('name, address, neighborhood, city, entry_code, building_entry_code, youtube_tutorial_url, canva_design_url, entry_instructions')
```
(The existing `{ ...property, … }` spread already forwards `entry_instructions` to `<GuestCheckIn>`.)

- [ ] **Step 6: Type-check + commit**
```bash
npx tsc --noEmit   # expect exit 0
git add src/components/features/guest-check-in.tsx src/components/features/guest-check-in.test.tsx "src/app/guest/[token]/page.tsx"
git commit -m "feat(guest): show native per-apartment entry instructions under the code"
```

---

## Verification
- `npx vitest run` → all pass.
- `npx tsc --noEmit` → clean.
- Manual after deploy: apply migration `00032`; in the property edit form paste `https://canva.link/...` → save → confirm it stores a `…/design/<id>/view` URL and the guest page embeds; set an apartment's Entry instructions → confirm they render under the code on the guest page.

## Self-Review
- Spec coverage: short-link resolution (Task A + B), entry-instructions field (Task C admin, Task D guest), Canva-field copy fix (Task C) — all present.
- Placeholders: none — full code in every step.
- Type consistency: `resolveCanvaDesignUrl(input: string | null): Promise<string | null>` used in A and B; `entry_instructions: string | null` on the guest property type matches the select + spread; the form reads/writes `entry_instructions` consistently.
