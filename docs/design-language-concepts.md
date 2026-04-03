# ApartmentOS — Design Language Concepts

Four distinct design directions for evaluation. Each is a complete token set and philosophy — not just a color swap.

---

## Concept 1: Jerusalem Stone

### Mood / Personality
Warm authority. The feeling of walking through Mamilla — refined stone, solid permanence, quiet confidence. Professional enough for a financial report, warm enough for a Jerusalem guest welcome. Trusts its own materials.

### Color Palette

| Role | Token | Hex | Usage |
|---|---|---|---|
| Primary | `--color-primary` | `#1E3A5F` | Nav, primary buttons, headings |
| Primary Light | `--color-primary-light` | `#2D5282` | Hover states, active tabs |
| Primary Pale | `--color-primary-pale` | `#EBF0F7` | Selected row bg, subtle highlights |
| Secondary | `--color-secondary` | `#C9A96E` | Accent borders, icons, financial positive |
| Secondary Dark | `--color-secondary-dark` | `#A8864A` | Secondary button hover, decorative |
| Surface 0 | `--color-surface-0` | `#FAFAF8` | App background (warm off-white) |
| Surface 1 | `--color-surface-1` | `#F5F3EF` | Card background |
| Surface 2 | `--color-surface-2` | `#EDE9E2` | Nested card, table row alt |
| Border | `--color-border` | `#D9D4CA` | Card borders, dividers |
| Text Primary | `--color-text-primary` | `#1A1714` | Body text |
| Text Secondary | `--color-text-secondary` | `#6B6158` | Labels, captions |
| Text Muted | `--color-text-muted` | `#9C9189` | Placeholder, disabled |
| Inverse Surface | `--color-inverse-surface` | `#1E3A5F` | Dark card (owner summary hero) |
| Inverse Text | `--color-inverse-text` | `#F5F3EF` | Text on dark surface |
| Status Safe | `--color-safe` | `#2D6A4F` | Income, available, confirmed |
| Status Warning | `--color-warning` | `#D4A017` | Pending, expiring soon |
| Status Danger | `--color-danger` | `#C0392B` | Overdue, urgent, vacancy |
| Status Info | `--color-info` | `#2D5282` | Informational, in-progress |

**Dark Mode Surfaces:**
- Background: `#12100E`
- Surface 1: `#1E1B18`
- Surface 2: `#2A2622`
- Border: `#3D3830`

### Typography

| Scale | Font | Weight | Size (mobile) | Size (desktop) | Line Height |
|---|---|---|---|---|---|
| Display | Newsreader | 400 (italic) | — | 36px | 1.2 |
| Page Title | Inter | 700 | 22px | 28px | 1.25 |
| Section Header | Inter | 600 | 15px | 16px | 1.35 |
| Card Title | Inter | 500 | 14px | 15px | 1.4 |
| Body | Inter | 400 | 14px | 14px | 1.6 |
| Caption | Inter | 400 | 12px | 12px | 1.5 |
| Data / Mono | IBM Plex Mono | 500 | 13px | 13px | 1.5 |
| Financial Hero | IBM Plex Mono | 600 | 28px | 36px | 1.1 |

Newsreader is used sparingly: owner report page titles, guest welcome header, empty state headings. Everything functional stays in Inter.

### Corner Radius Scale

| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | 4px | Badges, tags, status chips |
| `rounded-md` | 8px | Buttons, input fields |
| `rounded-lg` | 12px | Cards, modals |
| `rounded-xl` | 16px | Bottom sheets, drawer panels |
| `rounded-full` | 9999px | Avatars, pill filters, FAB |

### Elevation / Shadow Style

**Philosophy:** Soft, warm shadows with amber undertone. Cards feel like paper on a warm surface — slightly lifted, never harsh.

```css
--shadow-sm:  0 1px 2px 0 rgba(30, 23, 20, 0.06);
--shadow-md:  0 2px 8px -1px rgba(30, 23, 20, 0.10), 0 1px 3px 0 rgba(30, 23, 20, 0.06);
--shadow-lg:  0 8px 24px -4px rgba(30, 23, 20, 0.14), 0 2px 6px -1px rgba(30, 23, 20, 0.08);
--shadow-xl:  0 20px 48px -8px rgba(30, 23, 20, 0.18);
```

Cards use `shadow-md` at rest, `shadow-lg` on press/expanded (not hover — mobile-first, hover is secondary). Bottom sheets use `shadow-xl`.

### Key Visual Traits

- **Stone texture rhythm**: Alternating warm surface tones (surface-1 vs surface-2) create natural visual grouping without hard borders — like courses of Jerusalem stone.
- **Gold accent system**: The gold secondary (#C9A96E) is reserved purely for financial positive signals and structural decoration — never used for buttons. This gives it semantic weight.
- **Serif injection points**: Newsreader appears only at narrative moments (welcome text, report headers, empty state messages). Creates a deliberate contrast with the functional Inter grid. The rest of the UI is completely sans-serif.
- **Dense-but-breathable data tables**: 48px row height on mobile (touch-safe), with warm alternating rows instead of borders. Numbers right-aligned in IBM Plex Mono. Column headers in Inter 600.

### Best For
Admin dashboard (data density with warmth), Owner financial reports (the serif headlines elevate the reporting moment), Guest welcome page (warm and trustworthy). The concept scales well across all personas.

---

## Concept 2: Tel Aviv Office

### Mood / Personality
Crisp, confident, systematized. The aesthetic of a well-run real estate tech company — no decorative elements, every pixel earns its place. Fast-scanning dashboard energy. This is for people who live in spreadsheets and want the app to move at their speed.

### Color Palette

| Role | Token | Hex | Usage |
|---|---|---|---|
| Primary | `--color-primary` | `#0F172A` | Primary text, nav bg |
| Accent | `--color-accent` | `#3B82F6` | Primary buttons, links, active states |
| Accent Dark | `--color-accent-dark` | `#2563EB` | Button hover, pressed |
| Accent Pale | `--color-accent-pale` | `#EFF6FF` | Selected rows, active filter bg |
| Surface 0 | `--color-surface-0` | `#FFFFFF` | App background |
| Surface 1 | `--color-surface-1` | `#F8FAFC` | Card background |
| Surface 2 | `--color-surface-2` | `#F1F5F9` | Table row alt, nested panels |
| Border | `--color-border` | `#E2E8F0` | All borders and dividers |
| Border Strong | `--color-border-strong` | `#CBD5E1` | Active card border, focused input |
| Text Primary | `--color-text-primary` | `#0F172A` | Headings, important data |
| Text Secondary | `--color-text-secondary` | `#475569` | Labels, secondary text |
| Text Muted | `--color-text-muted` | `#94A3B8` | Placeholders, disabled states |
| Inverse Surface | `--color-inverse-surface` | `#0F172A` | Dark hero panels |
| Inverse Text | `--color-inverse-text` | `#F8FAFC` | Text on dark surface |
| Status Safe | `--color-safe` | `#16A34A` | Available, income, confirmed |
| Status Warning | `--color-warning` | `#D97706` | Pending, expiring |
| Status Danger | `--color-danger` | `#DC2626` | Overdue, urgent |
| Status Info | `--color-info` | `#0284C7` | In progress, informational |

**Dark Mode Surfaces:**
- Background: `#0F172A`
- Surface 1: `#1E293B`
- Surface 2: `#293548`
- Border: `#334155`

### Typography

| Scale | Font | Weight | Size (mobile) | Size (desktop) | Line Height |
|---|---|---|---|---|---|
| Page Title | Inter | 700 | 20px | 26px | 1.25 |
| Section Header | Inter | 600 | 13px | 14px | 1.35 |
| Card Title | Inter | 500 | 14px | 14px | 1.4 |
| Body | Inter | 400 | 14px | 14px | 1.5 |
| Caption | Inter | 400 | 11px | 12px | 1.45 |
| Data / Mono | Geist Mono | 500 | 13px | 13px | 1.5 |
| Financial Hero | Geist Mono | 700 | 26px | 32px | 1.1 |
| Overline/Label | Inter | 600 UPPERCASE | 10px | 11px | 1.6 + 0.08em tracking |

Full Inter/Geist Mono. No display typeface. Hierarchy is achieved through weight contrast (400 vs 700) and strict use of text-muted for secondary info. Uppercase overlines (letter-spacing: 0.08em) for section labels.

### Corner Radius Scale

| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | 3px | Tags, small badges |
| `rounded-md` | 6px | Buttons, inputs |
| `rounded-lg` | 10px | Cards |
| `rounded-xl` | 14px | Modals, sheets |
| `rounded-full` | 9999px | Avatars, switches |

Noticeably tighter radii than Concept 1 — feels more engineered, less organic.

### Elevation / Shadow Style

**Philosophy:** Crisp, cool shadows with blue undertone. Cards are clearly separated from background. Elevation is functional, not decorative.

```css
--shadow-sm:  0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.06);
--shadow-md:  0 4px 6px -1px rgba(15, 23, 42, 0.10), 0 2px 4px -2px rgba(15, 23, 42, 0.06);
--shadow-lg:  0 10px 15px -3px rgba(15, 23, 42, 0.12), 0 4px 6px -4px rgba(15, 23, 42, 0.06);
--shadow-xl:  0 25px 50px -12px rgba(15, 23, 42, 0.20);
```

Cards use `shadow-sm` at rest (very flat), `shadow-md` on expanded/active states. Strong left-border accent (4px blue) on active/selected cards instead of shadow escalation.

### Key Visual Traits

- **Left-accent selection pattern**: Active cards, selected list items, and focused sidebar items use a 4px left border in `--color-accent` instead of background fill. Feels like a professional SaaS tool. Immediately scannable which item is active.
- **Uppercase section labels**: Every section starts with a 10-11px uppercase overline label (Inter 600, 0.08em tracking, text-muted color). Creates predictable visual anchor points across all screens.
- **Tab-dense admin layout**: The admin dashboard uses a 3-column layout on iPad/desktop: narrow sidebar (240px) + content (fluid) + context panel (320px). On mobile it collapses to full-width with bottom tab nav. The layout is explicitly engineered for the admin's power-user pattern.
- **Functional icon usage**: Lucide icons throughout, 20px on mobile, 18px in dense lists. No decorative illustrations. Empty states use a simple icon + 2 lines of text + a single action button. No art.

### Best For
Admin dashboard (the power-user persona lives here), Contractor task views (the stark clarity helps on-site), any screen requiring rapid scanning of many items.

---

## Concept 3: Garden Apartment

### Mood / Personality
Fresh and approachable. The feeling of a well-kept garden apartment in the German Colony — clean white walls, subtle olive-green touches, natural light. Works as a consumer app that happens to manage property. Guests and first-time owner logins won't feel intimidated.

### Color Palette

| Role | Token | Hex | Usage |
|---|---|---|---|
| Primary | `--color-primary` | `#2D6A4F` | Nav, primary CTA, headings |
| Primary Light | `--color-primary-light` | `#40916C` | Hover states |
| Primary Pale | `--color-primary-pale` | `#D8F3DC` | Pill badges, highlight rows |
| Secondary | `--color-secondary` | `#52796F` | Icons, secondary actions |
| Tertiary | `--color-tertiary` | `#B7E4C7` | Decorative accents, chart fills |
| Surface 0 | `--color-surface-0` | `#FAFEFA` | App background (barely green-white) |
| Surface 1 | `--color-surface-1` | `#F0F7F4` | Card background |
| Surface 2 | `--color-surface-2` | `#E4F0EA` | Nested sections, table alt rows |
| Border | `--color-border` | `#C5DDD0` | Borders, dividers |
| Text Primary | `--color-text-primary` | `#1B2D25` | Body, headings |
| Text Secondary | `--color-text-secondary` | `#4A6358` | Labels, secondary |
| Text Muted | `--color-text-muted` | `#7A9B8A` | Placeholders, captions |
| Inverse Surface | `--color-inverse-surface` | `#1B4332` | Dark hero (owner summary) |
| Inverse Text | `--color-inverse-text` | `#F0F7F4` | Text on dark |
| Status Safe | `--color-safe` | `#2D6A4F` | (Shares primary — available, income) |
| Status Warning | `--color-warning` | `#E9C46A` | Pending, review needed |
| Status Danger | `--color-danger` | `#D62828` | Urgent, overdue |
| Status Info | `--color-info` | `#457B9D` | In progress, informational |

**Dark Mode Surfaces:**
- Background: `#0D1F18`
- Surface 1: `#152B21`
- Surface 2: `#1D3A2C`
- Border: `#2A5240`

### Typography

| Scale | Font | Weight | Size (mobile) | Size (desktop) | Line Height |
|---|---|---|---|---|---|
| Display | Playfair Display | 700 | — | 34px | 1.2 |
| Page Title | Funnel Sans | 700 | 21px | 26px | 1.25 |
| Section Header | Funnel Sans | 600 | 14px | 15px | 1.35 |
| Card Title | Funnel Sans | 500 | 14px | 15px | 1.4 |
| Body | Funnel Sans | 400 | 14px | 14px | 1.55 |
| Caption | Funnel Sans | 400 | 12px | 12px | 1.5 |
| Data / Mono | Geist Mono | 400 | 13px | 13px | 1.5 |
| Financial Hero | Geist Mono | 600 | 26px | 34px | 1.1 |

Funnel Sans is the workhorse — it's slightly more humanist than Inter, with friendlier letterforms. Playfair Display is used on guest welcome pages and owner report covers only.

### Corner Radius Scale

| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | 6px | Tags, chips |
| `rounded-md` | 10px | Buttons, inputs |
| `rounded-lg` | 16px | Cards |
| `rounded-xl` | 20px | Bottom sheets, modals |
| `rounded-full` | 9999px | Avatars, FAB, pill badges |

Notably more generous radii — softer, more consumer-app feeling.

### Elevation / Shadow Style

**Philosophy:** Green-tinted soft shadows. Cards have a light green cast to their shadow, reinforcing the palette. Feels like filtered natural light.

```css
--shadow-sm:  0 1px 3px 0 rgba(29, 80, 58, 0.07);
--shadow-md:  0 4px 12px -2px rgba(29, 80, 58, 0.11), 0 1px 3px 0 rgba(29, 80, 58, 0.06);
--shadow-lg:  0 8px 24px -4px rgba(29, 80, 58, 0.14), 0 2px 6px -1px rgba(29, 80, 58, 0.08);
--shadow-xl:  0 20px 40px -8px rgba(29, 80, 58, 0.18);
```

Cards use background-fill elevation (progressively darker surface color) rather than shadow primarily. Shadows are supplementary, used at larger elevations (sheets, dialogs) only.

### Key Visual Traits

- **Bento tile home screen**: The dashboard for owners uses an asymmetric bento grid of tiles rather than a list of cards. Financial summary tile (tall, spans 2 rows), occupancy tile, next checkout tile, pending tasks tile. The grid layout immediately communicates "you have a portfolio, here's its health."
- **Pill-first filtering**: All filter/tab systems use pill buttons with filled active state (primary-pale bg, primary text). No underline tabs anywhere. Feels more like a mobile app than a web admin.
- **Soft separator system**: Sections are separated by 8px of surface-2 background rather than visible border lines. Creates visual breathing room without hard edges.
- **Property cards with photo strip**: Each property card in any list view has a 48px horizontal photo strip along the top edge. Small but immediately identification-building — the admin knows which property at a glance without reading the name.

### Best For
Guest check-in pages (genuinely welcoming), Owner portal (Hybrid and Private tiers — they care about their specific property, not a financial dashboard), any onboarding or first-run experience.

---

## Concept 4: Operations Mode

### Mood / Personality
Raw utility. The design language of a construction site manager's tablet app — high contrast, high information density, designed to be used with one hand while standing outside. Nothing is decorative. Every tap counts.

### Color Palette

| Role | Token | Hex | Usage |
|---|---|---|---|
| Primary | `--color-primary` | `#111827` | Primary surface, text |
| Accent | `--color-accent` | `#F59E0B` | Primary CTA, active states, key icons |
| Accent Dark | `--color-accent-dark` | `#D97706` | Button pressed, hover |
| Accent Pale | `--color-accent-pale` | `#FEF3C7` | Active row bg, selected filter |
| Surface 0 | `--color-surface-0` | `#F9FAFB` | App background |
| Surface 1 | `--color-surface-1` | `#FFFFFF` | Card background |
| Surface 2 | `--color-surface-2` | `#F3F4F6` | Table rows alt, nested panels |
| Border | `--color-border` | `#D1D5DB` | Borders |
| Border Strong | `--color-border-strong` | `#9CA3AF` | Focused inputs, active card frame |
| Text Primary | `--color-text-primary` | `#111827` | All primary text |
| Text Secondary | `--color-text-secondary` | `#6B7280` | Labels, secondary text |
| Text Muted | `--color-text-muted` | `#9CA3AF` | Captions, placeholders |
| Inverse Surface | `--color-inverse-surface` | `#111827` | Dark header, status bar area |
| Inverse Text | `--color-inverse-text` | `#FFFFFF` | Text on dark |
| Status Safe | `--color-safe` | `#16A34A` | Done, available, income |
| Status Warning | `--color-warning` | `#F59E0B` | (Shares accent — pending, attention) |
| Status Danger | `--color-danger` | `#DC2626` | Urgent, failed, overdue |
| Status Info | `--color-info` | `#2563EB` | In progress, informational |

**Dark Mode Surfaces:**
- Background: `#111827`
- Surface 1: `#1F2937`
- Surface 2: `#28333F`
- Border: `#374151`

### Typography

| Scale | Font | Weight | Size (mobile) | Size (desktop) | Line Height |
|---|---|---|---|---|---|
| Page Title | Inter | 800 | 20px | 24px | 1.2 |
| Section Header | Inter | 700 | 13px UPPERCASE | 13px | 1.3 (tracking: 0.06em) |
| Card Title | Inter | 600 | 15px | 15px | 1.35 |
| Body | Inter | 400 | 15px | 14px | 1.5 |
| Caption | Inter | 400 | 12px | 12px | 1.4 |
| Data / Mono | IBM Plex Mono | 600 | 14px | 13px | 1.4 |
| Financial Hero | IBM Plex Mono | 700 | 30px | 38px | 1.0 |
| Status Badge | Inter | 700 | 11px | 11px | 1.0 |

Body text is slightly larger (15px) than other concepts — critical for usability in bright outdoor lighting and for contractors who may be using this quickly. The weight scale skews heavier: everything that matters is 600+.

### Corner Radius Scale

| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | 2px | Minimal — status chips, table tags |
| `rounded-md` | 4px | Buttons, inputs |
| `rounded-lg` | 8px | Cards |
| `rounded-xl` | 12px | Modals, sheets |
| `rounded-full` | 9999px | Avatars only |

Very sharp radii — almost square. The visual language deliberately avoids soft curves. This makes the amber accent read as more energetic and alert.

### Elevation / Shadow Style

**Philosophy:** Hard-edged, high-contrast separation. Cards don't have soft shadows — they have a visible 1px border + a 2px bottom border in border-strong color, creating a slightly extruded look. Shadow is used only for floating elements (FAB, modals).

```css
/* Cards: border-based, not shadow-based */
card: border: 1px solid #D1D5DB; border-bottom: 2px solid #9CA3AF;

/* Floating elements only */
--shadow-md:  0 4px 6px -1px rgba(17, 24, 39, 0.18), 0 2px 4px -2px rgba(17, 24, 39, 0.12);
--shadow-lg:  0 10px 15px -3px rgba(17, 24, 39, 0.22), 0 4px 6px -4px rgba(17, 24, 39, 0.12);
--shadow-xl:  0 25px 50px -12px rgba(17, 24, 39, 0.30);
```

The 2px bottom border on cards is a subtle skeuomorphic cue — like a physical card sitting on a surface. Reads clearly in sunlight.

### Key Visual Traits

- **Amber urgency system**: The amber accent (#F59E0B) doubles as the "attention required" color. On the contractor task view, every in-progress or pending item has an amber left-bar indicator. On the admin dashboard, overdue bills get an amber card frame. The color teaches itself — users learn that amber means "act on this."
- **XL touch targets throughout**: Minimum 52px touch height everywhere, 60px for primary actions. Row items in task lists are 60px minimum. This concept is designed to be used on a phone while literally moving.
- **Checklist-dominant contractor UI**: The contractor magic-link view is a pure checklist — no navigation, no sidebar, no admin chrome. Single column, large checkboxes (28px), task title in Inter 600, optional photo upload button on each row. Status badge at the top (5 tasks / 2 done). Amber progress bar.
- **Compact financial summary mode**: The owner Investor tier view in this concept shows only 4 numbers per property: Net Income, Occupancy Rate, Outstanding Bills, Last Payout Date. All in IBM Plex Mono 700. No charts. No breakdowns unless tapped. Maximum information in minimum space.

### Best For
Contractor magic-link views (this is the native language of on-site task completion), Investor-tier owners (they want 4 numbers, not a dashboard), Admin on mobile (managing emergencies at 7pm on Shabbat eve).

---

## Cross-Concept Token Decisions (Shared Regardless of Chosen Direction)

These tokens should be consistent across whichever concept is chosen, as they are dictated by functional requirements rather than aesthetic preference:

### Financial Display Rules
```
font-feature-settings: 'tnum' 1;  /* Tabular numbers — always on for currency */
font-variant-numeric: tabular-nums;
```

- All ILS amounts: `₪X,XXX.XX` format
- Income amounts: use `--color-safe`
- Expense amounts: use `--color-danger`
- Neutral/balance: use `--color-text-primary`
- Large financial hero numbers: always use the mono font, never sans-serif

### Status Color Requirements
Every concept satisfies WCAG AA contrast (4.5:1) against its respective surface colors for all status states.

### Touch Target Floor
All interactive elements: minimum `min-h-[44px]` (176px in Tailwind units = 44px). Primary CTAs: `min-h-[48px]`. Concept 4 upgrades this to `min-h-[52px]` and `min-h-[60px]` respectively.

### RTL Token Naming
All layout tokens use logical properties:
- `padding-inline-start` not `padding-left`
- `margin-inline-end` not `margin-right`
- `border-inline-start` for accent borders (not `border-left`)
- `text-align: start` for text that should align to reading direction

---

## Recommendation

**For Marcus Properties specifically:** Concept 1 (Jerusalem Stone) is the most coherent identity for this business. It is professional enough for owner financial reports, warm enough for guest check-in, and the gold accent creates natural emphasis on financial data (the most important content in the app). It also has the strongest Jerusalem identity — the client's business is intrinsically local and the design can reflect that without being kitsch.

**If the client prioritizes operational speed:** Blend Concept 1 surfaces/type with Concept 4's touch-target rules and contractor UI patterns. Use Concept 1 for admin/owner, Concept 4's checklist patterns for contractor views.

**For the contractor view specifically:** Concept 4's checklist UI is the correct pattern regardless of which overall concept is chosen. The contractor experience should always be the simplest, most task-focused UI in the app.
