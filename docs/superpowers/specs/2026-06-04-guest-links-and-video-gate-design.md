# Guest Links + Reveal-Gated Entry Video — Design

**Date:** 2026-06-04
**Status:** Approved (Approach A); pending written-spec review

## Background

Two issues from Ariel testing the live guest page:

1. **Leak:** the **Entry Video** shows the real door code in its instructions. Because the video card is always visible — even before the code is revealed — a guest with a not-yet-revealed link can watch the video and read the code, defeating the reveal gate.
2. **Feature:** Ariel wants to add **more custom link fields** for other useful videos/links per property.

## Goals

- The Entry Video is hidden until the code is revealed (closes the leak).
- Admins can add an arbitrary list of extra guest links (label + URL) per property.
- Each extra link can be **individually hidden until the code is revealed** (in case it also shows the code).

## Non-goals

- Migrating the existing `youtube_tutorial_url` into a unified list (kept as the dedicated Entry Video — Approach B rejected: extra migration/risk, loses the entry video's distinct treatment).
- Per-link icons beyond a simple video/link glyph, link reordering, or click analytics. Out of scope.

## Approach A — dedicated entry video (gated) + a flexible guest-links list

### Data model
New column: `properties.guest_links jsonb NOT NULL DEFAULT '[]'::jsonb`.
Shape — an ordered array of:
```json
{ "label": "string", "url": "string", "hide_until_revealed": false }
```
The existing `youtube_tutorial_url` stays as-is (the dedicated Entry Video).

### Leak fix (#1)
On the guest page, the **Entry Video card renders only when the code is revealed** — wrap it in the existing `codeVisible` gate. Before reveal it is omitted entirely; after reveal it appears alongside the code.

### Admin (property form)
A new **"Guest links"** section with repeatable rows. Each row:
- **Label** (text)
- **URL** (text)
- **"Hide until code is revealed"** (checkbox)

Plus **Add link** and a per-row remove control. The list is held in client state (initialized from `property.guest_links`), and serialized into the saved `data` as `guest_links`. Rows missing a URL are dropped on save; a row with a URL but no label falls back to a generic label ("Link").

### Guest page
Below the entry video, render each entry in `guest_links` as a tappable card (label + a video/link icon, opens in a new tab), in stored order. A link with `hide_until_revealed: true` is **omitted until `codeVisible` is true**; links with `hide_until_revealed: false` always show.

### Data flow
```
Admin edits property → properties.guest_links (jsonb)  +  youtube_tutorial_url
Guest opens link → guest page selects guest_links, youtube_tutorial_url
   ├─ Entry Video card        → shown only when codeVisible
   └─ each guest_links card    → shown unless (hide_until_revealed && !codeVisible)
```

### Error handling
- Malformed/empty `guest_links` → treat as empty list (no cards), page still works.
- A link with an empty URL is never rendered.

## Testing
- Guest view: **hides the Entry Video before reveal, shows it after**.
- Guest view: a `guest_links` item with `hide_until_revealed: true` is hidden before reveal and shown after; an always-visible item shows regardless.
- Guest view: renders each `guest_links` item as a card with its label + URL.
- Admin form: round-trips the guest-links list (add row → submit → `guest_links` JSON includes it; empty-URL rows dropped).

## Decided defaults
- New links default to `hide_until_revealed: false` (always visible); the admin opts a link into gating.
- Entry Video is always reveal-gated (it always contains the code) — no per-link toggle needed for it.

## Migration
`supabase/migrations/00033_property_guest_links.sql`:
```sql
ALTER TABLE properties ADD COLUMN guest_links JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN properties.guest_links IS 'Ordered guest-facing links [{label,url,hide_until_revealed}] shown on the check-in page.';
```
