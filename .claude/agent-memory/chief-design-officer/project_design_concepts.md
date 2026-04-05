---
name: ApartmentOS Design Language Concepts
description: v1 rejected (color swaps). v2 defines 4 architecturally distinct UX paradigms: Command Center, Ledger, Property First, Shift Planner
type: project
---

## v1 — REJECTED (2026-04-03)

Four named concepts (Jerusalem Stone, Tel Aviv Office, Garden Apartment, Operations Mode) defined color/typography systems but shared identical layout architecture. Client correctly identified these as color swaps, not genuinely different design directions.

**Rejection reason:** All four concepts used the same card-list-with-bottom-nav structure. No difference in information architecture, navigation model, or mobile UX paradigm.

## v2 — ACTIVE (2026-04-03)

Four genuinely different UX paradigms. Spec at `docs/design-language-concepts-v2.md`. 13-frame client presentation built in `pencil-new.pen`. PDF at `docs/design-previews/export.pdf`.

**Why:** Client needs to pick an architectural direction before build starts. v2 makes the difference legible — different organizing axes, not color palettes.

**How to apply:** Frame direction discussions around the organizing axis. When designing screens, use the palette and density of the chosen direction consistently.

---

## The 4 Directions — Full Detail

### Direction 1: COMMAND CENTER
- Organizing axis: Urgency
- Admin mental model: Triage inbox
- Navigation primary: Universal search / command palette
- Home screen: Urgency-ranked feed + always-visible command bar (48px)
- 4-tab nav: Home, Jump (command palette), Inbox, Me
- Swipe right = resolve, swipe left = snooze 2h
- Long-press = contextual action menu
- Colors: bg #F8F8F7, chrome #111827, accent #1E40AF, red #DC2626, amber #D97706, green #16A34A
- Typography: Inter UI, IBM Plex Mono for financial data. List items 56px tall.
- Inspired by: Linear, Superhuman, Raycast
- Best for: Admin persona (power-user, between site visits)

### Direction 2: LEDGER
- Organizing axis: Financial entity (property as account)
- Admin mental model: Accountant / CFO morning brief
- Navigation primary: Entity list (Portfolio, Calendar, Bills, Reports)
- Home screen: MTD portfolio summary hero (Revenue/Expenses/Net/Occupancy) + property ledger cards
- Each property card = mini income statement with occupancy bar + trend arrow
- Drill-down: property card → 4-tab detail (Summary, Bookings, Expenses, Docs)
- Bill approval: swipe-card stack (right = approve, left = reject)
- Colors: bg #FAFAFA, navy #1E3A5F, income green #15803D, expense red #B91C1C, net blue #1D4ED8, border #E5E7EB
- Typography: Inter UI, IBM Plex Mono for ALL financial figures. Hero net: 32-40px Mono 700.
- Inspired by: Mercury bank, Plain.com, Airtable
- Best for: Investor/Hybrid owner; admin during owner calls and financial reconciliation

### Direction 3: PROPERTY FIRST
- Organizing axis: Physical property as primary container
- Admin mental model: Portfolio manager scanning a board
- Navigation primary: 2-column photo grid home screen
- Inside property: self-contained workspace with 4 module icons below hero photo
- Module icon colors: Calendar #8B5CF6 (purple), Finances #16A34A (green), Tasks #F59E0B (amber), Docs #6B7280 (grey)
- No global Calendar/Tasks — all features accessed through property context
- Swipe left/right between properties once inside one
- Attention badge (red #EF4444) as primary urgency signal
- Card radius: 16px (consumer-app feel), photo aspect 16:10
- Colors: bg #F4F4F5, surface #FFFFFF, accent #2563EB, badge red #EF4444, status dots: green/amber/grey
- Typography: Inter 600 for property names. Financial figures in mono.
- Inspired by: Notion, Properly, iOS Photos
- Best for: Private-tier owner; admin doing daily property rounds

### Direction 4: SHIFT PLANNER
- Organizing axis: Time (vertical scroll = time passing)
- Admin mental model: Operations dispatcher
- Navigation primary: Live vertical timeline (Today, Week, Properties, Settings)
- Home screen: Chronological event stream, NOW indicator divides past/future
- Event type colors (left border): Clean #6B7280, Check-in #3B82F6, Check-out #8B5CF6, Contractor #F97316, Bill #F59E0B, Task #22C55E, Conflict #EF4444
- Filter chips: All / Clean / Check-in / Contractor / Bills
- Conflict detection: overlapping events shown red with inline suggested fix
- Snap to Now: floating cyan pill button (re-centers timeline)
- Drag-to-reschedule with real-time conflict haptic
- Dark mode default (OLED + outdoor Jerusalem use)
- Colors (dark): bg #0F172A, surface #1E293B, surface-alt #334155, NOW cyan #22D3EE, text #F1F5F9, muted #94A3B8
- Typography: Inter 600 for event titles. Time display: IBM Plex Mono 600, 17px tabular.
- Inspired by: Homebase, Notion Calendar, Wolt dispatch
- Best for: Admin on mobile for daily ops coordination; works for contractors (time-bound tasks)

---

## Cross-Direction Decisions (carry forward regardless of chosen direction)

- Agorot storage, ₪X,XXX.XX display format always
- tabular-nums font feature always on for financial figures
- IBM Plex Mono for all financial data in every direction
- Income = green, Expense = red, Net = distinguishable third color (blue in Ledger)
- Logical CSS properties (inline-start/end) for RTL readiness
- Min touch targets: 44px standard, 60px for contractor/outdoor primary actions
- Contractor magic link = always independent of admin/owner direction — zero-friction, no-login, stripped-down checklist with fixed green CTA bar

---

## Recommendation

- Admin daily surface: Shift Planner (scheduling pressure made visible)
- Owner portal: Ledger (financial-first, what Investor/Hybrid owners open the app for)
- Private owner: Property First (operational detail per property)
- Hybrid option: Shift Planner home + Property First photo-grid as secondary + Ledger for owner scope + Command Center's search as an overlay in any direction
- Contractor + Guest: always persona-specific, independent of chosen admin/owner direction

---

## Client Presentation — Pencil Node IDs (pencil-new.pen)

Built 2026-04-03 as a 13-frame 1200×900 landscape PDF-ready presentation.
PDF: `C:\Users\yitzym\Desktop\Property-management-\docs\design-previews\export.pdf`
PNGs: `C:\Users\yitzym\Desktop\Property-management-\docs\design-previews\`

| Frame | Name | Node ID |
|-------|------|---------|
| 01 | Cover | 61FLD |
| 02 | Command Center — Admin Dashboard | Dce3H |
| 03 | Command Center — Components | 728wt |
| 04 | Command Center — Contractor Magic Link | YsgXE |
| 05 | Ledger — Admin Dashboard | iOFKT |
| 06 | Ledger — Property Detail | mGKFg |
| 07 | Ledger — Components | tym8n |
| 08 | Property First — Home Grid | f8pGl |
| 09 | Property First — Inside a Property | AfUVv |
| 10 | Property First — Components | JZMEF |
| 11 | Shift Planner — Today's Timeline | SgciU |
| 12 | Shift Planner — Conflict Scenario | haD7X |
| 13 | Shift Planner — Components | 84YEJ |

---

## Ledger Implementation State — CDO Audit 2026-04-05 (Comprehensive)

See full audit report produced this session for complete P0/P1/P2 breakdown.

### Summary Scores (out of 10)
- Interface Design: 6.5/10
- Design System Consistency: 7/10
- Transitions & Animations: 3/10
- Mobile-First UX: 6/10
- Visual Polish: 5.5/10
- Admin UX: 6.5/10
- Owner Portal UX: 4.5/10
- Contractor UX: 7.5/10
- Guest UX: 6/10
- Navigation & IA: 6.5/10
- Empty/Error/Loading States: 5/10
- Accessibility: 5.5/10

### Top Critical Findings
1. Copper accent NEVER used in any UI element — entire brand identity missing
2. Owner portal has no navigation shell
3. TaskCreateDialog uses raw UUID fields — unusable by non-technical admin
4. Bills page renders all 3 status sections simultaneously — no tab filtering
5. No page-level transitions — app feels like static HTML
6. `window.location.reload()` in 3+ components — jarring UX
7. `text-[10px]` used in 15+ locations — below WCAG minimum
8. Error/404 use Unicode emoji entities instead of Lucide icons

## Ledger Implementation State — Design Review 2026-04-03

### What is working well
- Token architecture: base.css + ledger.css direction override is correctly structured
- `CurrencyDisplay` component: correct — font-mono, tabular-nums, agorot conversion, semantic variants
- `StatusBadge` / `StatusDot`: correctly uses token classes (`text-status-warning`, etc.)
- IBM Plex Mono is loaded and used for financial figures consistently in most screens
- `DateDisplay`: Jerusalem timezone, semantic time element, good
- Bottom nav 4-tab pattern is correct Ledger architecture
- Loading skeleton (`loading.tsx`) exists and uses animate-pulse pattern
- DirectionProvider correctly sets `data-direction="ledger"` on `<html>`

### Critical Issues Found

#### 1. Hardcoded Tailwind color classes bypassing the token system (CRITICAL)
Locations: `bills/page.tsx`, `tasks/page.tsx`, `calendar/page.tsx`, `owners/page.tsx`, `financials/page.tsx`, `contractor-task-view.tsx`, `guest-check-in.tsx`, `bill-actions.tsx`, `gmail-connect.tsx`, `inventory/page.tsx`
Pattern: `bg-yellow-100 text-yellow-800`, `bg-green-100 text-green-800`, `bg-red-100 text-red-800`, `text-green-700`, `bg-green-600`, `bg-red-100 text-red-600`
Fix: Replace with `StatusBadge` component or token classes (`bg-status-warning/15 text-status-warning`)
The `StatusBadge` component already exists and handles this correctly — it just isn't being used in page files.

#### 2. globals.css bare :root conflicts with ledger.css (HIGH)
The bare `:root` block in globals.css (shadcn defaults — black primary, grey accent) loads before ledger.css direction tokens. Since `data-direction` is applied in `useEffect` (client-side), there is an SSR flash window where the page renders with grey/black shadcn defaults before the navy/copper palette kicks in. Fix: Set `data-direction="ledger"` in the Next.js root layout's `<html>` tag directly, not via useEffect.

#### 3. Bottom nav touch targets are undersized (HIGH)
Bottom tabs render as `py-2` with icon + 10px label. Total height ~48px. However the tap target width is `flex-1` over `max-w-lg` — on a 375px phone that is ~93px wide per tab which is fine. But the vertical touch target is borderline. Add `min-h-[52px]` to each tab link.

#### 4. Hamburger button touch target is too small (CRITICAL)
`SheetTrigger` is `h-8 w-8` = 32px × 32px. WCAG minimum is 44×44px. Fix: `h-11 w-11` or wrap with a larger invisible tap area.

#### 5. Sidebar-nav.tsx is dead code (MEDIUM)
The old `sidebar-nav.tsx` still exists but is not imported anywhere in the admin layout (which uses `LedgerShell`). It uses `bg-primary text-primary-foreground` for active state — which is correct — but the component is unused. Should be deleted or formally deprecated.

#### 6. Bills and Tasks pages do not use StatusBadge (HIGH)
Both pages define local `statusColors` Record<string,string> objects with hardcoded Tailwind classes. These duplicate the logic already in `StatusBadge` and bypass the token system. The existing `StatusBadge` component handles every status these pages use.

#### 7. Contractor complete button uses hardcoded green (MEDIUM)
`bg-green-600 hover:bg-green-700` on the primary CTA. This should use `bg-status-safe hover:bg-status-safe/90` or ideally the primary/accent button variant. The contractor context intentionally uses high-contrast green for confidence, but it should still pull from the token.

#### 8. Guest check-in entry code uses hardcoded green (MEDIUM)
`border-green-200 bg-green-50`, `text-green-700`, `text-green-900` — the "code revealed" state should use status-safe tokens. The green is semantically correct but bypasses the system.

#### 9. Guest check-in YouTube card uses hardcoded red (LOW)
`bg-red-100` / `text-red-600` for the YouTube play icon. This is a brand color (YouTube red), not a status. Acceptable but should be extracted to a constant.

#### 10. Empty state text for module loading is inadequate (MEDIUM)
`bill-module.tsx` shows plain `<p>Loading bills...</p>` text. Should use the skeleton pattern from `loading.tsx`.

#### 11. `text-[10px]` usage is widespread — below minimum readable size on mobile (HIGH)
Section labels, badge text, and metadata use `text-[10px]` (10px). WCAG 1.4.4 requires text be resizable; 10px is below the 12px practical floor for mobile body text. Replace labels with `text-xs` (12px) minimum.

#### 12. Property detail TabsList has no scroll on narrow viewports (MEDIUM)
Four tabs (Bookings, Bills, Tasks, Vault) in `TabsList` without `overflow-x-auto`. On 375px with commission badge info row above, the tabs risk clipping. Add `overflow-x-auto` to the TabsList wrapper.

#### 13. Login page has no brand visual identity (MEDIUM)
The login page is a generic `CardTitle="ApartmentOS"` + `CardDescription="Property Management Platform"`. No logo, no navy header, no copper accent. First impression of the product. Add navy header band matching guest check-in pattern.

#### 14. Dashboard missing section for "Today's check-ins" urgency (MEDIUM)
The dashboard shows upcoming bookings but the Ledger direction spec called for the property cards to be mini income statements. The current property cards show only name/address/commission — no revenue figure, no occupancy indicator. This is the most important gap from the Ledger concept.

#### 15. No pull-to-refresh, no optimistic updates (LOW — future)
These are PWA patterns not yet implemented. Flag for future sprint.

## v1 Presentation Node IDs (pencil-new.pen) — kept for reference

- Frame 1 — Cover: `EVuwv`
- Frame 2 — Jerusalem Stone: `FA5mN`
- Frame 3 — Tel Aviv Office: `oUZle`
- Frame 4 — Garden Apartment: `ZRQeX`
- Frame 5 — Operations Mode: `dZaSw`
