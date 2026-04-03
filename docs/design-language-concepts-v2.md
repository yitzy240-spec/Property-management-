# ApartmentOS — Design Language Concepts v2

**Status:** Research-based exploration. Four genuinely different UX/UI directions.  
**Date:** 2026-04-03  
**Context:** Jerusalem property management PWA. ~20 properties. Admin on mobile between site visits. Owners checking financials. Contractors via magic links. Guests on check-in day.

**Why v2 exists:** Version 1 defined four color/typography systems on the same underlying layout. This document defines four architecturally distinct UX paradigms — different ways of thinking about how the app is structured, navigated, and used.

---

## How to Read This Document

Each direction answers: *what mental model does the user bring to this app, and how does the interface match it?*

A property manager on mobile is not the same person as a financial dashboard user. They have different mental models, different contexts, different urgency levels. Good UX direction selection means choosing the model that fits the actual daily reality of the person.

---

---

# Direction 1: COMMAND CENTER

**Tagline:** Everything is one keystroke away. Nothing is buried.

---

## Design Philosophy

The admin managing 20 Jerusalem properties is not sitting at a desk filling in forms. They are between a contractor call and a guest check-in, thumb on glass, needing to find one specific thing and act on it immediately. Command Center treats the app as a professional instrument rather than a portal — the way Linear, Superhuman, and Raycast treat their domains.

The central insight: **navigation is a failure mode**. Every tap through a menu tree is a moment the user didn't find what they needed. Command Center collapses the app's depth into a single, instant-access surface: a persistent command bar at the top that searches properties, bookings, tasks, bills, and people simultaneously. Below it, a curated activity feed surfaces what demands attention right now, ranked by urgency.

This direction solves the "I know what I need but I can't find it" problem that plagues every property management app.

**Draws from:** Linear (speed-first, keyboard-native philosophy), Superhuman (inbox-zero for operations), Raycast (universal search as primary interface), Superhuman email client.

---

## Layout Architecture

**Mobile (375px) — primary surface:**

```
┌─────────────────────────────┐
│  ≡  ApartmentOS      [Bell] │  ← 52px header, minimal
│─────────────────────────────│
│  🔍 Search or jump to...    │  ← Always-visible command bar, 48px
│─────────────────────────────│
│                             │
│  TODAY'S WATCH              │  ← Prioritized urgency feed
│  ─────────────────          │
│  ⚠️  Apt 4B — bill overdue  │
│  🔑  Guest: Yael Cohen      │  ← Check-in 14:00 today
│  🔧  Plumber ETA: 11:30     │
│  ✅  8 tasks due this week  │
│                             │
│  PROPERTIES QUICK-JUMP      │  ← Horizontal pill scroll
│  [Apt 1A] [Apt 2B] [Beit...] │
│                             │
│  RECENT ACTIONS             │  ← Ghost text — last 3 things done
│  Invoice #441 sent          │
│  Shmuel updated task        │
│                             │
├─────────────────────────────┤
│  [Home]  [Jump]  [Inbox]  [Me]│  ← 4-tab bottom nav
└─────────────────────────────┘
```

**The Jump screen** (second tab) is a full-screen command palette: type a property name, guest name, date, or task keyword. Results appear in categorized sections below. This is the power-user's home.

**The Inbox** accumulates everything awaiting a decision: bill approvals, task confirmations, guest requests, owner questions. Zero-inbox mental model.

---

## Navigation Model

Primary navigation is **search-first, not menu-first**. The command bar is always reachable. Bottom nav has 4 items:

- **Home** — Today's urgency feed + quick-jump pills
- **Jump** — Full command palette / universal search
- **Inbox** — Decision queue (bills to approve, tasks to confirm)
- **Me** — Profile, settings, notifications

Secondary navigation is **contextual**. When viewing a property, a floating context bar appears: `[Overview] [Calendar] [Finances] [Tasks] [Docs]`. This replaces tabs — it slides in from the bottom when a property is selected, over the main feed.

**No sidebar.** Sidebars are a desktop concession. On mobile, context is delivered through sheets that rise from the bottom.

---

## Information Hierarchy

**Prominent:** Urgency-ranked action items. Anything with a deadline or a blocked state rises to the top of the home feed. The number next to the Inbox tab is a pressure gauge — getting to zero matters.

**One click deep:** Properties are accessible via pills, recent items, or search. No drilling through a property list → property detail → tab → sub-section.

**Hidden intentionally:** Configuration, reports, bulk operations, archive. These are power-user features accessed via the Jump palette (type "reports" and they appear) or a long-press context menu. They do not clutter the primary surface.

**Progressive disclosure pattern:** Tapping a feed item expands it inline (accordion) for quick resolution. Full detail opens as a bottom sheet over the feed — the feed remains visible behind it.

---

## Mobile UX Paradigm

- **Pull-to-refresh** on the urgency feed — muscle memory for "catch me up"
- **Swipe right** on any feed item = mark resolved / dismiss
- **Swipe left** on any feed item = snooze 2 hours
- **Long-press** on any item = contextual action menu (reassign, escalate, link to property)
- **Command bar tap** = instant full-screen search with keyboard raised
- **Bottom sheet stack** — sheets layer (property → task → edit form), back-swipe down to dismiss each layer
- **Haptic feedback** on swipe completion and urgent alerts

---

## Key Screens: How They Feel

**Admin dashboard:**  
Opens to the urgency feed. Three urgent items with color-coded left borders (red = blocking, amber = due soon, blue = informational). Below, a horizontally scrolling row of property pills — each shows a live status dot (green = clear, amber = attention, red = urgent). The command bar sits at top like a professional tool, not a search afterthought. Sparse, fast, purposeful.

**Property detail:**  
Accessed by tapping a pill or a search result. A full-screen bottom sheet rises showing the property's current state: a large calendar strip across the top (current month, booking density visible), below that a 3-column row of key numbers (occupancy %, revenue MTD, open tasks). Below that: the property-specific urgency feed (same pattern as home, scoped to this property). Everything is scannable in 4 seconds.

**Contractor magic link:**  
Arrives at a stripped-down task view — no chrome, no navigation, no brand distractions. Task title in large bold type at top. Below: a numbered checklist, each item 60px tall with a checkbox on the right (thumb-friendly). A "Mark complete" bar is fixed to the bottom in green — one tap finishes the job. If photos are required, the camera icon is inline with the task item, not buried in a menu.

---

## Color and Typography Direction

**Philosophy:** High signal-to-noise. Color is only used to convey status. Background is near-white (not pure white). UI chrome is monochrome — navigation, labels, structural elements are all neutral grey. Only urgency signals break this: red, amber, green for status. The command bar has a subtle gradient border to signal "this is the power tool."

- Background: `#F8F8F7` (barely warm off-white)
- Surface: `#FFFFFF`
- Chrome / UI elements: `#111827` (near-black), mid-grey for inactive
- Status red: `#DC2626`
- Status amber: `#D97706`
- Status green: `#16A34A`
- Accent / brand: `#1E40AF` (deep blue — used only on primary actions and active states)
- Typography: Inter throughout. Page title 20px/700. Body 14px/400. Data labels 12px/500 uppercase tracked. Financial figures: IBM Plex Mono 600.
- Density: Medium-compact. List items 56px tall. Cards with 12px padding.

---

## Real-World Inspiration

- **Linear** — Speed-first philosophy, keyboard navigation, urgency-ranked issue feeds
- **Superhuman** — Zero-inbox mental model, swipe gestures for triage, minimal chrome
- **Raycast** — Universal search as primary interface, command palette as power tool

---

## Best For

**Admin persona.** This direction was designed for someone who has 20 things on their mind and needs to act fast. Owners would find it too sparse (they want narrative, not urgency). Contractors already get a stripped-down version regardless of direction. Guests get a completely separate surface.

---

---

# Direction 2: LEDGER

**Tagline:** Every property tells a financial story. Read it at a glance.

---

## Design Philosophy

The property manager's core business reality is financial — commissions, utility bills, owner payouts, VAT thresholds, occupancy rates, channel fees. Every operational action (booking, task, repair) is ultimately a line in a ledger. Ledger direction treats financial data as the primary organizing principle: the app is structured like a set of accounts, each property is an account, and the dashboard is a real-time P&L.

This draws from the design language of financial tools — Mercury bank's crisp card-based dashboard, Bloomberg terminal's data density (adapted for mobile), and the spreadsheet-like clarity of Airtable's grid view. The key insight: **owners and admins are making financial decisions constantly**. The UI should make those decisions obvious, not buried under operational noise.

**This is the only direction that takes financial data out of a "Reports" tab and puts it on the primary surface.**

**Draws from:** Mercury bank (trust-building financial UI), Bloomberg (data density that experts read fluently), Airtable (structured data as primary surface), Plain.com (entity-centric CRM design).

---

## Layout Architecture

**Mobile (375px) — primary surface:**

```
┌─────────────────────────────┐
│  Marcus Properties    [+]   │  ← Brand name + add action
│─────────────────────────────│
│                             │
│  MTD PORTFOLIO SUMMARY      │  ← Fixed hero block
│  ┌─────────────────────┐    │
│  │ Revenue    ₪47,830  │    │
│  │ Expenses   ₪12,440  │    │  ← Card with subtle grid lines
│  │ Net        ₪35,390  │    │
│  │ Occupancy  78%      │    │
│  └─────────────────────┘    │
│                             │
│  PROPERTIES                 │  ← Each property = a ledger card
│  ┌─────────────────────┐    │
│  │ Apt 4B — Ben Yehuda │    │
│  │ ████████░░  8/12    │    │  ← Occupancy bar inline
│  │ ₪6,200 net  ▲ +12%  │    │  ← Revenue with trend indicator
│  │ 1 open task  ⚠️ bill │    │  ← Status signals at bottom
│  └─────────────────────┘    │
│                             │
│  ┌─────────────────────┐    │
│  │ Apt 2A — Emek Refaim│    │
│  │ ░░░░░░░░░░  3/12    │    │
│  │ ₪1,800 net  ▼ -8%   │    │
│  └─────────────────────┘    │
│                             │
├─────────────────────────────┤
│ [Portfolio] [Calendar] [Bills] [Reports]│
└─────────────────────────────┘
```

**Every property card is a mini income statement.** Tap it to drill into the full account view: booking-by-booking revenue, expenses itemized (cleaning, maintenance, bills), commission breakdown, and owner payout calculation. This is what owners log in to see, and what the admin references when an owner calls.

---

## Navigation Model

**Entity-first, not feature-first.** The navigation is organized around *things* (properties, owners, bills) not *features* (calendar, reports, tasks). Bottom nav:

- **Portfolio** — All-properties ledger view (current default)
- **Calendar** — Booking timeline across all properties
- **Bills** — The financial inbox: utility bills, invoices, approvals
- **Reports** — Monthly/quarterly PDF generation, owner payout statements

Drilling down from Portfolio to a property opens a **segmented tab set** within the property view: `[Summary] [Bookings] [Expenses] [Documents]`. Not a new page — a contextual tab group within the property card that expands.

**Owner portal** uses the same architecture but scoped: they only see their property's ledger. The same card structure, same tabs — just one account instead of twenty.

---

## Information Hierarchy

**Prominent:** Financial numbers — always formatted as ₪X,XXX, always color-coded (income in a warm green, expense in a muted red, net in a bold neutral). Numbers are large and monospaced. Occupancy is shown as both a number (78%) and a visual bar — two representations of the same truth.

**Secondary:** Operational signals — task counts, open bills, upcoming check-ins. These are small status chips at the bottom of each property card. They inform but do not dominate.

**Hidden:** Raw booking data, task details, contractor communication. Accessible through drill-down but never on the summary surface.

**Progressive disclosure:** Property card (summary) → Property detail tabs → Individual booking/bill → Edit/action. Four layers maximum. Each layer adds exactly one level of specificity.

---

## Mobile UX Paradigm

- **Vertical scroll** is the primary navigation — the portfolio is a ledger list, you scroll it
- **Horizontal scroll within a property card** — the tabs (`[Summary] [Bookings] [Expenses]`) swipe horizontally once the card is tapped and expanded
- **Pull-to-refresh** = re-fetch financial data from Lodgify
- **Tap + hold** on a number = copy to clipboard (useful when an owner calls asking for a figure)
- **Swipe up on bills tab** = enter the bill approval flow — a native-feeling card stack where you swipe right to approve, left to reject
- **Bottom sheet for adding** — the `[+]` button opens a sheet asking "What would you like to add?" with 4 large buttons: Booking, Expense, Bill, Task
- **Sticky summary bar** — when scrolling down the property list, the portfolio summary (MTD revenue / net) stays pinned at the top as a thin bar

---

## Key Screens: How They Feel

**Admin dashboard:**  
Feels like a financial report that's alive. The portfolio summary hero uses a subtle grid background (like graph paper) — a visual nod to accounting without being literal. Below it, property cards scroll vertically. Each card has a clear visual hierarchy: property name in bold, occupancy bar in muted blue, revenue figures in large mono type, status chips in small caps at the bottom. The overall feel is "a CFO's morning brief, on your phone."

**Property detail:**  
Full-screen view dominated by a booking calendar at the top (month view, bookings shown as colored bars by channel: Airbnb=pink, Booking.com=blue, Direct=green). Below: a revenue breakdown table with columns for gross rent, channel fee, commission, net. Tapping any row expands the booking detail. At the bottom: expense ledger for this property this month. The document vault is the last tab — invoices and bills stored and retrievable.

**Contractor magic link:**  
Same stripped-down checklist as Command Center direction — the magic link experience is persona-specific and does not reflect the admin/owner design language. Large checklist items, fixed action bar at bottom, photo upload inline.

---

## Color and Typography Direction

**Philosophy:** Precision and trust. This is financial data — it needs to feel authoritative and accurate, not playful. Clean white surfaces. Dark, legible type. Financial figures always in monospace. Color is used sparingly and semantically: green for positive, red for negative, blue for neutral/informational.

- Background: `#FAFAFA` (near-white, barely warm)
- Surface: `#FFFFFF`
- Surface alt (table rows): `#F5F5F4` (light grey, alt rows)
- Primary text: `#111827`
- Secondary text: `#6B7280`
- Income green: `#15803D` (strong, dark green — not pastel)
- Expense red: `#B91C1C` (strong, dark red)
- Net neutral: `#1D4ED8` (blue — the bottom line is blue, intentionally different from income/expense)
- Border: `#E5E7EB`
- Accent (brand): `#1E3A5F` (deep navy — used for primary actions and brand moments)
- Typography: Inter 400/500/600 for UI labels. IBM Plex Mono 500/600 for all financial figures. Financial hero (MTD total): 32px Mono 700.
- Density: Medium. Property cards 120px tall at rest (expandable). Portfolio summary hero 100px.

---

## Real-World Inspiration

- **Mercury bank** — Clean, trust-building financial card UI. Data is prominent, not buried.
- **Plain.com** — Entity-centric design where every customer is an account with full history
- **Airtable grid view** — Tabular data that feels natural, not intimidating

---

## Best For

**Investor-tier and Hybrid owners** — they log in for the numbers, and this direction serves numbers first. **Admin** benefits during owner calls and financial reconciliation. This direction works less well for Private owners who need task-level operational detail on the same surface.

---

---

# Direction 3: PROPERTY FIRST

**Tagline:** Your properties are the interface. Everything lives inside them.

---

## Design Philosophy

Every other property management app organizes around features: a Calendar section, a Messages section, a Reports section, a Tasks section. The user has to mentally translate: "I need to know about Apartment 4B" → navigate to Calendar → filter by 4B → navigate to Reports → filter by 4B → navigate to Tasks → filter by 4B.

Property First inverts this. **The property is the primary navigational unit.** You open the app, you see your properties. You select one. You are now *inside* that property — and everything (calendar, finances, tasks, documents, guest info) is organized under that single property context. No mental translation required.

This mirrors how a physical property manager actually thinks: they think in properties, not in feature categories. "I need to deal with Emek Refaim 4B" is a thought that contains all the features — you're not thinking "I need to check the Emek Refaim 4B tab in the tasks section."

**Draws from:** Notion (everything lives inside a page hierarchy — pages as primary containers), Properly (property-centric operations app), Shortcut (the project is the unit, not the feature), iOS Files app spatial organization.

---

## Layout Architecture

**Mobile (375px) — primary surface:**

```
┌─────────────────────────────┐
│  Marcus Properties          │
│─────────────────────────────│
│                             │
│  MY PROPERTIES              │
│  ┌──────────┐ ┌──────────┐  │  ← 2-column card grid
│  │ [photo]  │ │ [photo]  │  │
│  │          │ │          │  │
│  │ Apt 4B   │ │ Apt 2A   │  │
│  │ ● 3 open │ │ ● 1 open │  │  ← Attention count
│  │ 👤 Yael  │ │ 🔓 Vacant│  │  ← Current status
│  └──────────┘ └──────────┘  │
│                             │
│  ┌──────────┐ ┌──────────┐  │
│  │ [photo]  │ │ [photo]  │  │
│  │          │ │          │  │
│  │ Beit     │ │ King     │  │
│  │ HaKerem  │ │ George   │  │
│  │ ● Clean  │ │ ● 0 open │  │
│  └──────────┘ └──────────┘  │
│                             │
│  ┌──────────────────────┐   │
│  │ + ADD PROPERTY       │   │  ← Last card
│  └──────────────────────┘   │
│                             │
├─────────────────────────────┤
│ [Properties] [Alerts] [Add] [Me]│
└─────────────────────────────┘
```

**Inside a property:**

```
┌─────────────────────────────┐
│  ← Apt 4B — Ben Yehuda     │
│─────────────────────────────│
│  ┌─────────────────────┐    │
│  │      [PHOTO]        │    │  ← Large property hero image
│  │  ● Guest: Yael Cohen│    │  ← Status overlay on photo
│  │  Check-out: Apr 5   │    │
│  └─────────────────────┘    │
│                             │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐│
│  │ 📅 │ │ ₪  │ │ ✅ │ │ 📄 ││  ← 4 icon-tab modules
│  │Cal │ │Fin │ │Tasks│ │Docs││
│  └────┘ └────┘ └────┘ └────┘│
│                             │
│  UPCOMING                   │  ← Default module: calendar
│  Apr 3 ─── Apr 7  Yael C.   │
│  Apr 9 ─── Apr 14 [vacant]  │
│  Apr 15 ── Apr 22 David L.  │
│                             │
│  THIS WEEK TASKS            │
│  ○ Pre-arrival clean        │
│  ○ Towels restocked         │
│  ✓ Key code updated         │
│                             │
└─────────────────────────────┘
```

**Each property is a self-contained workspace.** The property photo is not decorative — it is the primary orientation cue (20 properties look different; photos are faster to recognize than names). Below it, four module buttons: Calendar, Finances, Tasks, Documents. The default view shows a combined summary of upcoming bookings and current week's tasks — the two things the admin most often needs to check.

---

## Navigation Model

**Two-level hierarchy, no more:**
1. Properties list (home screen)
2. Inside a property (everything under that property)

No global Calendar. No global Reports. No global Tasks. All features are accessed through the property context.

**For admin:** A global **Alerts** tab (second in bottom nav) aggregates what needs attention across all properties — essentially the urgency feed from Command Center, but secondary to the property-first organization. Tapping an alert takes you directly into the right property at the right section.

**For owners:** The property list shows only their properties. Identical architecture, just scoped.

**For admin needing cross-property views:** The Alerts tab handles urgency. A swipe-down on the property list reveals a **filter/group bar** — filter by status (occupied, vacant, cleaning), sort by revenue or attention count. This is the cross-property view, but it's accessed through the list rather than a separate section.

---

## Information Hierarchy

**Most prominent:** The property itself — photo, name, current occupancy status (guest name or "vacant"), and an attention count badge (how many open items need resolution).

**Second layer:** The four module icons — calendar, finances, tasks, documents. Tapping takes you inside that module for this property.

**Third layer:** Module content — the calendar shows bookings for this property, finances shows this property's P&L, tasks shows this property's open items.

**Hidden:** Cross-property data (only accessible via Alerts or filtered list view). System configuration. Bulk operations (accessible via long-press in property list).

**Progressive disclosure:** Property grid → Property detail (4 modules) → Module content → Individual item (booking, task, bill) → Edit/action. Clean 4-step maximum.

---

## Mobile UX Paradigm

- **Photo recognition** — Property cards use actual property photos. No photo = bold color tile with initials (like a contacts app). Spatial recognition is faster than reading names when you manage 20 properties.
- **Swipe between properties** — Once inside a property, swipe left/right to navigate to the next/previous property. This mirrors how you'd flip through a folder of property files.
- **Module icons as persistent bottom context bar** — Inside a property, the bottom nav becomes property-module navigation (Calendar, Finances, Tasks, Docs). Back to the list via the header back button.
- **Attention badge as primary urgency signal** — The red badge on a property card drives behavior: clear the badge by resolving items inside.
- **Long-press on property card** = quick actions: Add task, Add booking, Share link, Call owner.
- **Pull-to-refresh** on property list = sync all property states
- **Pinch to zoom out** on the property grid = switch to compact list view (more properties visible)

---

## Key Screens: How They Feel

**Admin dashboard:**  
A photo grid of properties — like a visual portfolio. Each card is a window into that property's current reality: the photo grounds you spatially, the status overlay tells you who's there, the attention badge tells you what needs action. Scrolling down reveals all 20 properties. The experience feels like having a board of CCTV monitors for each apartment — you scan for the ones with issues.

**Property detail:**  
A focused, single-property workspace. The large hero image at top makes you feel "inside" this property context. Below it, the four module buttons are large, icon-first, label below — easy to tap and instantly recognizable. The default content area shows the current week at a glance: upcoming bookings as a compact timeline strip, current tasks as a checkbox list. Everything you need for a site visit briefing, in one scroll.

**Contractor magic link:**  
Landing page shows the property photo (large, full-width) with the property name below — the contractor immediately knows they're in the right place. Below the photo: task list as large checkboxes. The entire screen is task-focused — no navigation, no login, no distraction. Photo requirement for task completion shows an inline camera button that opens to full-camera without leaving the task.

---

## Color and Typography Direction

**Philosophy:** Properties are the characters — let them breathe visually. The chrome should recede; the property content (photos, status) should dominate. This direction uses more photography-forward design — the UI frames the property data rather than competing with it.

- Background: `#F4F4F5` (cool light grey — neutral to not compete with property photos)
- Surface: `#FFFFFF`
- Card: `#FFFFFF` with `1px #E4E4E7` border — subtle, lets photos be the visual interest
- Primary text: `#18181B`
- Secondary text: `#71717A`
- Attention badge: `#EF4444` (standard iOS red — immediately legible)
- Status occupied: `#16A34A` (green dot overlay on photo)
- Status vacant: `#9CA3AF` (grey dot)
- Status attention: `#F59E0B` (amber dot — cleaning needed, task overdue)
- Brand / primary action: `#2563EB` (clear blue)
- Module icon colors: Calendar `#8B5CF6`, Finances `#16A34A`, Tasks `#F59E0B`, Docs `#6B7280`
- Typography: Inter 600 for property names on cards, 400 for body. Module labels: 11px uppercase tracked. Financial figures in mono.
- Card radius: 16px — generous, consumer-app feeling, makes the photo cards feel premium
- Photo aspect ratio: 16:10 on property cards

---

## Real-World Inspiration

- **Notion** — Pages as primary containers; everything lives within a page context, not in a global feature section
- **Properly** — Property photo-first operations app for vacation rental managers
- **iOS Photos albums view** — Spatial recognition via photography, not text lists

---

## Best For

**Private-tier owners** — they manage one or a few properties operationally and want to feel connected to each one specifically. Also strong for **admin** doing daily rounds across properties. Less ideal for Investor-tier owners who want pure financial summaries without operational detail.

---

---

# Direction 4: SHIFT PLANNER

**Tagline:** Time is the spine. Everything happens when it happens.

---

## Design Philosophy

A short-term rental property has a fundamentally temporal structure: check-in at 14:00, cleaning window 10:00–13:00, contractor arriving at 11:30, bill due on the 15th, owner payout on the 1st. The real estate business does not organize around properties — it organizes around *time*. A property manager's day is a series of time-bound events that must not collide.

Shift Planner makes **time the primary organizational axis** of the entire application. The dashboard is a live timeline — not a calendar grid, but a continuous vertical scroll of what's happening now, next, and coming up. This draws from how operations tools like Homebase (shift scheduling), Notion Calendar, and the Wolt Israel dispatch view organize work around a flowing timeline rather than a hierarchical menu structure.

The insight: **collision detection is the admin's real job**. Two properties with check-out and check-in on the same day, one cleaner, one contractor slot — managing that scheduling pressure is the hard problem. A timeline view makes it visible.

**Draws from:** Homebase/When I Work (shift-based operations scheduling), Wolt dispatch timeline (real-time operations feed), Notion Calendar (entity-rich calendar), Linear Cycles (time-boxed work periods as organizing principle).

---

## Layout Architecture

**Mobile (375px) — primary surface:**

```
┌─────────────────────────────┐
│  Thu, Apr 3   [Week] [Day]  │  ← Date header, toggleable view
│─────────────────────────────│
│                             │
│  NOW                        │  ← Current time marker
│  ────────────────────────── │
│                             │
│  10:30  ░░░░ CLEANING       │  ← Time + event type + property
│  │      Apt 4B              │
│  │      [Shmuel Cohen]      │  ← Assigned person
│  │                          │
│  11:30  🔧 CONTRACTOR       │
│  │      Apt 4B — plumbing   │
│  │      [Yossi Plumbing]    │
│  │                          │
│  13:00  🔑 CHECK-IN         │
│  │      Apt 2A              │
│  │      [Yael Cohen, 3 nts] │
│  │                          │
│  14:00  🔑 CHECK-IN         │
│  │      Apt 6C              │
│  │      [David Levy, 1 nt]  │
│  │                          │
│  17:00  📋 BILL DUE         │
│  │      Electricity — 4B    │
│  │      ₪840 — [Approve]    │  ← Inline action
│  │                          │
│  ── TOMORROW ───────────── ─│
│  10:00  🧹 CLEAN — Apt 2A   │
│                             │
├─────────────────────────────┤
│ [Today] [Week] [Properties] [Settings]│
└─────────────────────────────┘
```

**The timeline is the dashboard.** Events are typed: cleaning (grey), check-in (blue), check-out (purple), contractor (orange), bill (amber), task (green). Each event block has the time on the left, a color-typed left border, event type label, property name, and assigned person or guest name. Tapping expands inline.

**Week view** shows a horizontal day-strip at the top (Mon–Sun), with each day's event count as a dot. Tapping a day scrolls the timeline to that day. This is the overview mode.

**Conflict detection:** If two events at the same property overlap or create an impossible cleaning window, the timeline shows them in red with a "⚠ Window too tight" label. Visible at a glance.

---

## Navigation Model

**Time-based primary navigation:**
- **Today** — Live timeline for today (default home)
- **Week** — 7-day compressed view with event density indicators
- **Properties** — Secondary view: property list as context for filtering the timeline
- **Settings** — Configuration, owner management, integrations

**Filtering** is done via a persistent filter chip row beneath the date header:
`[All] [Clean] [Check-in] [Contractor] [Bills]` — tapping a chip filters the timeline to that event type only. This is how the admin checks "what contractors do I have today?" — one tap, not a separate section.

**Context actions** are inline — every timeline block has one primary action button within it (Mark complete, Approve, Message guest, Call contractor). You act from the timeline without leaving it.

---

## Information Hierarchy

**Prominent:** What is happening *right now* and *what's next*. The "NOW" line divides past from future. Upcoming items are full opacity; past items are muted (70% opacity) to show they're done/happened. Conflicts (overlapping events, tight windows) are highlighted in amber.

**Second priority:** The event type and the people involved — who is doing what, at which property. The property name is secondary to the *event* (a check-in at Apt 4B is more important to see as a "check-in" than as "Apt 4B").

**Hidden:** Financial detail, booking history, document vault. Accessible by tapping into a specific booking or bill event, which opens a bottom sheet with full detail.

**Progressive disclosure:** Timeline event (summary) → Expanded event block (detail + actions) → Full bottom sheet (edit, history, related items). Three layers.

---

## Mobile UX Paradigm

- **Vertical scroll is time** — scrolling up = past, scrolling down = future. This is a native mental model (like a social feed, but for your schedule)
- **"Snap to now" button** — A floating pill button (bottom-left) that scrolls you back to the current time marker. Like a GPS "re-center" button.
- **Swipe right on event = mark complete** — A completion gesture that crosses out the event and plays a subtle haptic
- **Swipe left on event = reassign** — Opens an assignee sheet for that event
- **Long-press on event = move in timeline** — Drag to reschedule. Conflict detection fires in real-time as you drag (red highlight on drop zone if it causes a conflict)
- **Day-switch by swipe** — Swipe the entire timeline left/right to move one day forward/back
- **"Add to timeline" FAB** — Floating action button (bottom-right) opens a contextual sheet: what type? (Clean / Check-in / Task / Bill) → which property? → what time?
- **Haptic on conflicts** — When a conflict is detected (drag-to-reschedule), a distinctive haptic pattern fires before visual feedback

---

## Key Screens: How They Feel

**Admin dashboard:**  
Opens directly to today's timeline. The current time is marked with a subtle horizontal line and a pulsing dot on the left edge (like a live recording indicator). Past events above the line are muted. Upcoming events below are full contrast, color-bordered by type. If today is quiet (2 events), the empty space between events communicates that: breathing room, not dead space. If today is dense (8 events, back-to-back clean and check-in at the same property), the visual compression of the timeline communicates the pressure. The overall feeling is operational intelligence — a daily briefing that changes as the day progresses.

**Property detail:**  
Accessed by tapping a property name in any timeline event, or from the Properties tab. Instead of a static property card, the property detail shows that property's *own timeline* — scoped to this property, same format, but showing all events past and future. Scroll up to see last month's bookings as a historical timeline. This makes the property detail feel like a living log rather than a static form.

**Contractor magic link:**  
The contractor receives a magic link for a specific task. Their view is a single-event timeline card: large time display at top (11:30), property address below it with a maps link, task details in a large-type list below that. Fixed "I'm here / Mark done" button at bottom. If they're a repeat contractor, their past visits at this property are shown as a collapsed history below — professional context.

---

## Color and Typography Direction

**Philosophy:** Operations-grade clarity. Time-based apps need to communicate urgency and sequence without visual chaos. Color is used systematically by event type (not by status), so the admin builds muscle memory: amber = bill, blue = check-in, grey = cleaning. Dark-mode-first — this is a tool used all day, including outdoors in Jerusalem sun, and dark backgrounds reduce glare on OLED screens.

**Dark mode as default (light mode available):**
- Background: `#0F172A` (deep slate blue-black)
- Surface: `#1E293B` (card surface)
- Surface alt: `#334155` (hover, expanded state)
- Primary text: `#F1F5F9`
- Secondary text: `#94A3B8`
- Timeline spine: `2px #334155` vertical line on left edge
- NOW indicator: `#22D3EE` (cyan — stands out against dark surface)
- Event: Clean: `#6B7280` left border (neutral grey)
- Event: Check-in: `#3B82F6` (blue)
- Event: Check-out: `#8B5CF6` (purple)
- Event: Contractor: `#F97316` (orange)
- Event: Bill: `#F59E0B` (amber)
- Event: Task: `#22C55E` (green)
- Conflict state: `#EF4444` (red, used only for conflict highlighting)
- Typography: Inter 600 for event titles, 400 for details. Time display: 17px IBM Plex Mono 600 (tabular, critical). Financial figures: Mono 500.
- Light mode: same event colors, background `#F8FAFC`, surface `#FFFFFF`.

---

## Real-World Inspiration

- **Homebase** — Shift-scheduling timeline for operations teams; time is the primary axis
- **Notion Calendar** — Rich event objects on a timeline; entities have depth, not just titles
- **Linear Cycles** — Time-boxed work as the organizing principle; progress visible on the timeline

---

## Best For

**Admin persona on mobile.** This direction shines when the property manager is physically moving between properties and needs to see "what is happening right now and what's next." Also highly usable for **contractors** (whose whole interaction is time-bound: they arrive at a time, complete tasks, leave). Less suited to Investor owners who want financial summaries, not operational timelines.

---

---

# Comparison Matrix

| Dimension | Command Center | Ledger | Property First | Shift Planner |
|---|---|---|---|---|
| **Primary organizing axis** | Urgency | Financial entity | Physical property | Time |
| **Admin mental model** | Triage inbox | Accountant | Portfolio manager | Operations dispatcher |
| **Navigation primary** | Universal search | Entity list | Photo grid | Live timeline |
| **Home screen is** | Urgency feed | Portfolio P&L | Property card grid | Today's event stream |
| **Information density** | Medium-compact | Medium-dense | Medium-sparse | Medium-dense |
| **Best admin moment** | Quick action between calls | Owner phone call | Pre-site-visit check | Morning ops brief |
| **Owner view** | Borrowed (scoped urgency) | Native (their ledger) | Native (their property) | Limited (no timeline value) |
| **Contractor view** | Stripped checklist | Stripped checklist | Photo-first checklist | Time-anchored checklist |
| **RTL adaptation** | Search bar flips | Number alignment stays | Grid flips, photo unchanged | Timeline spine flips to right edge |
| **Mobile paradigm** | Search + swipe triage | Scroll ledger + card swipe | Photo grid + swipe-between-properties | Scroll-as-time + drag-to-reschedule |
| **Dark mode** | Optional | Optional | Optional | Default |
| **Main risk** | Too sparse for owner reporting | Operations feel secondary | Cross-property visibility requires extra step | Financial data feels buried |

---

# Recommendation

**For ApartmentOS with ~20 properties and a single admin managing them on mobile:**

**Primary recommendation: Shift Planner** for the admin daily-use surface. The admin's real challenge is coordinating overlapping check-outs, cleans, contractor arrivals, and check-ins across multiple properties on the same day. No other direction makes that coordination pressure visible at a glance.

**Secondary recommendation: Ledger** for the owner portal. Owners log in for financial data — quarterly reviews, occupancy rates, payout statements. The ledger card structure is exactly what they need.

**Hybrid option:** Build the admin shell with Shift Planner's timeline as the primary home screen, add a Properties tab using Property First's photo-grid, and scope the owner portal using Ledger's entity structure. Command Center's universal search bar can be added to any of these as an overlay — it's a feature, not a direction. This hybrid approach is common in mature apps: the organizing philosophy of the primary screen shapes the app's identity, while supporting screens can borrow from other paradigms.

**Contractor and guest surfaces** are persona-specific and should be designed independently of whichever direction is chosen for admin/owner — they have fundamentally different needs that no single "direction" should dictate.

---

# What Has Not Changed From v1

The following decisions from v1 remain valid regardless of which direction is chosen:

- All financial figures stored as agorot (integer), displayed as ₪X,XXX.XX
- Tabular-nums font feature on all financial displays
- Income = safe color (green), Expense = danger color (red), Net = distinguishable third color
- Logical CSS properties throughout (inline-start/end, not left/right) for RTL readiness
- Minimum touch targets: 44px standard, 52px+ for primary contractor/outdoor actions
- IBM Plex Mono for all financial figures, regardless of the direction's overall type system
- shadcn/ui as the component foundation — direction shapes which components are used and how, not whether the library is used
- Contractor magic link = zero-friction, no-login, task-focused — always independent of the admin/owner design language

---

*Sources consulted: Guesty, Hostaway, Breezeway, Turno platform analysis; Linear design philosophy documentation; Mercury bank UX review; Bento Grid design trend research (2025–2026); Things 3 design philosophy; Arc browser spatial navigation patterns; Wolt Israel app evolution; Bank Leumi mobile accessibility; PWA gesture navigation best practices; SaaS dashboard design trends 2026.*
