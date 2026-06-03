# Guest Link Expiry & Code Update — As-Built Status

**Last updated:** 2026-06-03
**Branch:** `feat/codes-and-link-expiry` (18 commits ahead of `main`, all pushed to origin)
**Original plan:** [2026-06-03-guest-link-expiry-and-code-update.md](2026-06-03-guest-link-expiry-and-code-update.md)
**Original spec:** [../specs/2026-05-29-guest-link-expiry-and-code-update-design.md](../specs/2026-05-29-guest-link-expiry-and-code-update-design.md)

This document captures the state of the work for anyone (Claude, Yitzy, a reviewer) picking it up later — particularly on a fresh machine without prior session memory.

---

## TL;DR

All 18 plan tasks are implemented and committed. The branch is pushed. Production migrations are applied. Two of three required Vercel env vars are set. The only thing blocking merge + deploy is **Ariel providing an Anthropic API key.** PR has not yet been opened (no `gh` CLI on the dev machine — see below).

---

## What is implemented

### Section A — Guest magic link expiry/reveal controls

- New form when generating a guest link: pick "Reveal immediately" or "Reveal in N days" (resolves to 07:00 Jerusalem on day N) and "Never expires" or "Expires in N days" (resolves to 23:59 Jerusalem on day N). Live resolved timestamp shown in UI.
- Resolution math lives in [src/lib/jerusalem-time.ts](../../../src/lib/jerusalem-time.ts) — DST-correct via iterate-to-converge, with tests for both IST→IDT (2026-03-27) and IDT→IST (2026-10-25) crossovers.
- API at [src/app/api/magic-links/route.ts](../../../src/app/api/magic-links/route.ts) accepts absolute ISO `expires_at` and `code_reveals_at`, validates them, persists to DB. JWT `exp` is a 10-year placeholder when DB `expires_at` is null — DB row is the source of truth.
- Guest page at [src/app/guest/[token]/page.tsx](../../../src/app/guest/[token]/page.tsx) gates by the DB row, not the booking. Booking-tied 24h logic removed.
- Email at [src/lib/email.ts](../../../src/lib/email.ts) mentions the scheduled reveal time when it's in the future.

### Section B — Canva code update workflow

- New admin page at [/codes](../../../src/app/(admin)/codes/page.tsx). Form: pick apartment code (+ optional building code) → select apartments → submit. Sidebar entry added in [ledger-shell.tsx](../../../src/components/layout/shells/ledger-shell.tsx) under "Properties" with the `KeyRound` icon.
- Job-backed API at [src/app/api/codes/update/route.ts](../../../src/app/api/codes/update/route.ts). **Runs synchronously inside POST** (Vercel kills fire-and-forget after response close). `maxDuration = 60`, cap of 20 properties per job.
- Per-job results persisted to `code_update_jobs.results` JSONB. Polling endpoint at [src/app/api/codes/jobs/[id]/route.ts](../../../src/app/api/codes/jobs/[id]/route.ts).
- Canva integration in [src/lib/canva.ts](../../../src/lib/canva.ts): OAuth code exchange, token storage (encrypted via `src/lib/encryption.ts`), refresh-if-needed, MCP call via Anthropic Messages API.
- OAuth routes at [src/app/api/auth/canva/route.ts](../../../src/app/api/auth/canva/route.ts) (start + DELETE for disconnect) and [src/app/api/auth/canva/callback/route.ts](../../../src/app/api/auth/canva/callback/route.ts). Signed-state CSRF protection.
- Settings UI in [src/app/(admin)/settings/page.tsx](../../../src/app/(admin)/settings/page.tsx) with [canva-connect.tsx](../../../src/components/features/canva-connect.tsx) and [canva-status-toast.tsx](../../../src/components/features/canva-status-toast.tsx). Toast strictly whitelists status codes — never echoes attacker-controlled text.

### PWA cache fix (bundled)

- [next.config.js](../../../next.config.js) excludes `/guest/*`, `/contractor/*`, `/api/*` from runtime caching.
- Token pages declare `export const dynamic = 'force-dynamic'`.

---

## Migrations (already applied to production)

| File | What |
|------|------|
| [00030_magic_link_reveal_expiry.sql](../../../supabase/migrations/00030_magic_link_reveal_expiry.sql) | `magic_links.expires_at` nullable; add `code_reveals_at TIMESTAMPTZ NULL` |
| [00031_code_update_jobs.sql](../../../supabase/migrations/00031_code_update_jobs.sql) | New `code_update_jobs` table with admin-only RLS |

Confirmed applied via `SELECT count(*) FROM code_update_jobs;` returning 0.

---

## Vercel production env vars

| Var | Status |
|-----|--------|
| `CANVA_CLIENT_ID` | Set (value `OC-AZ6ETdGAtv37`) |
| `CANVA_CLIENT_SECRET` | Set |
| `ANTHROPIC_API_KEY` | **Outstanding — awaiting Ariel** |

When the Anthropic key arrives, set it via:

```bash
printf "sk-ant-..." | npx vercel env add ANTHROPIC_API_KEY production
```

Use `printf` not `echo` to avoid a trailing newline corrupting the key.

---

## Verified during development

- **OpenRouter does NOT support `mcp_servers` passthrough.** Sent two live probes to `https://openrouter.ai/api/v1/messages` with `anthropic-beta: mcp-client-2025-11-20` and `mcp_servers` pointing at Canva. Both returned `NO_TOOLS_AVAILABLE`, including the forced-Anthropic-direct provider variant (`provider: { only: ["anthropic"] }`). OpenRouter strips the field. **Direct Anthropic API key is required** for the code-update Canva push.
- **Anthropic MCP beta header was updated.** `mcp-client-2025-04-04` (used in Ariel's skill) is deprecated. We use the current value `mcp-client-2025-11-20` — committed at `16a3690`.

---

## What still needs to happen

1. **Receive Anthropic API key from Ariel.** Add via `printf | npx vercel env add ANTHROPIC_API_KEY production`.
2. **Open PR.** GitHub URL: https://github.com/yitzy240-spec/Property-management-/pull/new/feat/codes-and-link-expiry — `gh` CLI was not installed on the dev machine. PR description draft is in the conversation transcript and the original plan doc.
3. **Manual smoke test** (per the plan's Task 18 list):
   - Guest link with delayed reveal — verify code hidden then revealed
   - Guest link with `never_expires` — verify it works past 72h
   - Canva OAuth roundtrip via `/settings` → "Connect Canva"
   - `/codes` run against a Canva-linked apartment — verify both DB and Canva guide updated
   - `/codes` with Canva disconnected — verify DB-only updates and "Skipped" message
   - PWA cache fix — change `entry_code` in DB, refresh guest page, new code shows

---

## Code review issues that were addressed before merge

Flagged by the final CTO audit and fixed at commit `1cfef6a`:

1. **Vercel kills `void processJob(...)`** — switched to synchronous processing inside the POST handler with `maxDuration = 60` and a 20-property cap. Without this fix, any multi-property update would silently truncate after the first one.
2. **DST math drift on changeover days** — extracted `jerusalemDateAt` to a shared helper with iterate-to-converge; added boundary-day tests.
3. **Toast XSS surface** — callback no longer forwards free-form error text into the toast; whitelist of codes only.

Important issues *not* fixed (deferred):

- Double-submit race on `code_update_jobs.results` (would require an idempotency key)
- Polling has no client-side timeout for stuck jobs
- `canva-connect.tsx` uses `window.confirm` instead of project's dialog component
- `loadCanvaTokens` in `/codes` silently swallows decryption errors

---

## Resuming on a fresh machine

```bash
# 1. Clone if needed
git clone https://github.com/yitzy240-spec/Property-management-.git
cd Property-management-

# 2. Pull the branch
git fetch origin feat/codes-and-link-expiry
git switch feat/codes-and-link-expiry

# 3. Install (use PowerShell on Windows if rm -rf hits file locks)
npm install

# 4. Pull production env vars (needs vercel login)
npx vercel env pull .env.local

# 5. Sanity check
npx tsc --noEmit
npx vitest run src/lib/jerusalem-time.test.ts src/lib/magic-links.test.ts src/lib/canva.test.ts src/lib/email.test.ts
```

Expected: type-check clean, 33/33 tests pass.

---

## Commit history (most recent first)

```
16a3690 fix(canva): use current anthropic-beta header (mcp-client-2025-11-20)
1cfef6a fix: address final code review issues
7cfdc73 feat(nav): add Codes sidebar entry and document new env vars
4fb43bb feat(codes): admin page for code updates with progress polling
2f74abe feat(codes): job-backed code update endpoint and polling endpoint
5a9d2a1 feat(canva): MCP call wrapper for design code updates via Anthropic Messages API
da64610 feat(settings): Canva connect/disconnect UI in settings page
9287023 feat(canva): OAuth start and callback routes
6407b7f feat(canva): OAuth code exchange, token storage, and refresh helpers
35f1e26 feat(canva): design ID parser and token type
0085581 feat(magic-links): guest link generator with reveal/expiry controls
e9cafb5 feat(email): mention scheduled code reveal time in guest check-in email
752a5e2 feat(guest): DB-backed reveal/expiry gate (replaces booking-tied 24h gate)
9ef9a29 feat(magic-links): accept absolute expires_at and code_reveals_at params
fc0bf0d feat(magic-links): add reveal/expiry timestamp helpers and validation
7316a31 feat(db): add code_update_jobs table for tracking code change runs
196bad7 feat(db): add code_reveals_at and make expires_at nullable on magic_links
f1575a0 fix(pwa): bypass cache for guest/contractor/api routes so DB updates aren't masked
```
