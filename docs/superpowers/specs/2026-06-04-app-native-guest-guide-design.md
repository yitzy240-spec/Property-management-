# App-Native Guest Guide & Embedded Canva — Design

**Date:** 2026-06-04
**Status:** Approved in principle (Ariel: "Let's do it"); pending written-spec review
**Supersedes:** the Canva-MCP auto-edit half of [2026-05-29-guest-link-expiry-and-code-update-design.md](2026-05-29-guest-link-expiry-and-code-update-design.md)

## Background

The original feature aimed to keep entry codes in sync across two systems: when an apartment/building code changes, update it in ApartmentOS **and** in the per-apartment Canva guide. The Canva half was built to run from our server via the Anthropic Messages API + Canva MCP connector, using a stored Canva OAuth token.

That approach is **not viable**, confirmed against the live Canva servers:

1. The Canva **MCP server is a separate OAuth authorization server** (`issuer: https://mcp.canva.com`) from the Connect REST API. A Connect-API token is rejected by the MCP with `"Authentication error… check your authorization token."`
2. The MCP's OAuth **only allows redirects to an allow-listed set of hosts** — `localhost` (local MCP clients) and `claude.ai` (Anthropic's hosted connector). Our domain `app.marcus-properties.com` is rejected at the authorize step (`400 "Invalid redirect URI. It must be from an allowed host."`). So our web app cannot complete the MCP OAuth at all.
3. The Canva **Connect REST API** does not expose programmatic text find-and-replace or design-content reading for arbitrary designs (those are Apps-SDK / MCP capabilities).

Ariel's existing personal Claude skill (`marcus-code-agent`) edits Canva successfully precisely because it runs inside Claude (an allow-listed host).

## Key decision (Ariel)

When asked "why do we need Canva for the code at all?", Ariel agreed **100%**: the entry code should **not** live in Canva. The app's guest magic-link page already shows the **live code** (from the DB, reveal-gated) and already references the Canva guide. The path forward is to make the **app magic link the single source of truth for the code**, and treat the Canva guide as embedded visual content.

Ariel's constraints:
- The instructions *around* the code are critical and **vary per apartment** ("sometimes then right, sometimes turn left"). They must come through, not be reduced to a generic line.
- The video is the "how to get in" video; its label should signal that.
- The rich guide (wifi, appliances, neighborhood, photos) is "pleasing to browse" and he updates it in Canva every few months. He wants to **keep editing it in Canva**.

## Goals

- Guest opens **one app magic link** and sees: their live entry code, the relabeled entry video, and the **full Canva guide embedded inline and browsable** — without leaving the app.
- The entry code lives in **one place** (the app DB) and **never needs editing in Canva**.
- Ariel keeps maintaining the rich guide **and the per-apartment entry instructions** in Canva, in one place, with no app-side duplication.
- Remove the now-dead Canva auto-push / OAuth code so it can't mislead.

## Non-goals

- Building an in-app rich-guide editor to replace Canva. Deferred — making in-app editing as easy/customizable as Canva is a separate, larger effort. Ariel keeps Canva for now.
- Programmatically extracting the entry-instruction text from Canva into native app UI. **Not feasible** (requires the blocked MCP `get-design-content`). The instructions surface via the embedded viewer instead.
- Per-apartment / per-language native entry-instruction fields. Not needed — instructions live in the embedded Canva guide.
- Reveal/expiry time-of-day being admin-configurable (see Future enhancements).

## Approach (A+): app owns the live code; Canva guide is embedded inline

### 1. Embed the Canva guide as an in-app viewer

Today the guide is a **link-out card** ([guest-check-in.tsx:79](../../../src/components/features/guest-check-in.tsx)) that opens Canva in a new tab. Replace it with an **embedded iframe viewer** of the design's public view (`https://www.canva.com/design/<id>/view?embed`), so the guest browses the multi-page guide inline. The embed renders the **published** design, so Ariel's Canva edits and new pictures appear automatically — no API, no sync.

- Derive the embed URL from the stored `properties.canva_design_url` (a sharing link) using the existing `parseCanvaDesignId()` to get `<id>`, then build the `/view?embed` URL.
- Wrap the iframe in a **responsive aspect-ratio container** so it isn't cramped on mobile, with a **"Open fullscreen / view in Canva"** fallback link (covers mobile awkwardness and any embed failure).
- The instructions ride inside the embedded guide. **Recommendation to Ariel:** make the entry instructions the **first page** of the guide so they appear right under the live code.

> ⚠️ **Build-time verification:** confirm the exact public embed URL works for the share-link format stored in `canva_design_url`, the design is set to **"anyone with the link can view,"** and the viewer is acceptable on a phone. Prototype this against one real design (e.g. Agripas 8) before finishing the UI.

### 2. Live code card — unchanged source, lighter framing

Keep the live code card (`entry_code` / `building_entry_code`, reveal-gated — already built). Its generic one-line instruction ("Use the building code… Simplex lock") becomes a short pointer to the guide below (e.g. "Full entry steps are in your guide below"), since the apartment-specific steps now come from the embed.

### 3. Relabel the video card

Rename **"Apartment Video Guide" → "Entry Video Guide"** with a description that signals it shows *how to get in* ([guest-check-in.tsx:162](../../../src/components/features/guest-check-in.tsx)). Source (`youtube_tutorial_url`) unchanged.

### 4. Remove the dead Canva auto-push / OAuth

The Canva connect/OAuth/MCP path can never work from our server, so remove it to avoid confusion (including the PKCE/callback/diagnostic code added in PRs #2–#3 while chasing this):

- Delete OAuth routes `src/app/api/auth/canva/{route,callback/route}.ts`.
- Delete the Settings "Connect Canva" UI (`canva-connect.tsx`, `canva-status-toast.tsx`, the settings section).
- Delete the Canva OAuth/MCP/token helpers in `src/lib/canva.ts` (`getCanvaAuthorizeUrl`, `exchange/refresh/store/load/clearCanvaTokens`, `updateCanvaDesignCodes`, PKCE helpers) and their tests. **Keep `parseCanvaDesignId`** — reused for the embed URL.
- `/codes`: keep the **DB bulk code-update** (still useful), remove the "Update Canva guide" checkbox and the Canva call in `api/codes/update`. Decide during planning whether `code_update_jobs` is still warranted for DB-only updates or can be simplified.
- Remove now-unused env vars (`CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, and the Canva `app_settings` token rows) and the `ANTHROPIC_API_KEY` if it has no other consumer. **Rotate the exposed Anthropic key regardless.**

### 5. Ariel's one-time manual steps (in Canva)

- Set each guide design to **"anyone with the link can view."**
- **Remove the printed "Apartment code / Building code" text** from each design (app shows the live code).
- Move/ensure the **entry instructions are the first page** of each guide.

## Data flow

```
Admin sets entry_code/building_entry_code in app  ──▶  properties (DB)
Guest opens magic link ──▶ guest page reads DB (live, reveal-gated)
                          ├─ live code card  (from DB)
                          ├─ entry video card (youtube_tutorial_url)
                          └─ embedded Canva viewer (canva_design_url → /view?embed; published design, instructions + rich content)
```

Single source of truth: **code → app DB**; **instructions + visuals → Canva (embedded)**.

## Error handling

- Missing/invalid `canva_design_url` → omit the embed (page still works), as today.
- Embed fails to load / design not public → the "Open in Canva" fallback link remains; consider a lightweight "couldn't load the guide — tap to open" state.
- Reveal not yet due → live code stays hidden (unchanged); the embed and video still render.

## Testing

- Unit: embed-URL derivation from a sharing link (valid link → correct `/view?embed`; junk/null → no embed).
- Component: guest view renders the embed when `canva_design_url` present + fallback link; renders relabeled "Entry Video Guide"; hides code pre-reveal.
- Regression: existing guest-page reveal/expiry tests still pass; removing the Canva-push code breaks no remaining tests.
- Manual: one real design on a phone (the build-time verification above).

## Decided defaults

- Reveal **7:00 AM**, expiry **11:59 PM** Israel time on day N — **unchanged**, kept as a single named config constant.
- Entry instructions: **embedded from Canva**, no native field.

## Future enhancements (out of scope)

- Admin setting to adjust the reveal/expiry **time-of-day** (kept cheap by the single-constant design above).
- In-app rich-guide editor to fully replace Canva, if/when in-app editing can match Canva's ease.
