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

## v1 Presentation Node IDs (pencil-new.pen) — kept for reference

- Frame 1 — Cover: `EVuwv`
- Frame 2 — Jerusalem Stone: `FA5mN`
- Frame 3 — Tel Aviv Office: `oUZle`
- Frame 4 — Garden Apartment: `ZRQeX`
- Frame 5 — Operations Mode: `dZaSw`
