# Visit Management — Design Spec

**Date:** 2026-04-14
**Requested by:** Ariel Marcus
**Status:** Draft

---

## Overview

A visit tracking system for Ariel to log routine property inspections on a 2-week cycle. Owners see completed visit logs (what was done, photos, notes) on their dashboard. Ariel gets private admin notes for future visit reminders.

## Requirements Summary

### Visits Page (Admin — `/visits`)
- New page accessible from left nav, under Properties
- Properties displayed as rows grouped into 3 sections:
  - **This Week** — next visit due within 7 days (includes overdue)
  - **Later** — next visit due 8+ days out
  - **Occupied** — property has an active booking or owner stay right now
- Each row shows: property name, last visit date, days until due (or days overdue), and a "Log Visit" button
- Overdue properties: red left border + red "X days overdue" text
- Due-soon properties: yellow left border
- Occupied properties: dimmed styling, "Occupied" badge, shows checkout/end date + "Visits resume [date]" (checkout + 14 days)
- Most recent admin note (from the last visit to that property) shown inline on the row (copper text with pin icon, admin-only)
- No summary bar at top

### Visit Schedule Logic
- **Cycle:** 14 days from the last visit
- **After occupancy ends:** 14 days from checkout/owner-stay-end date (not from the last visit before occupancy)
- **New properties:** 14-day grace period from when the property was created before first visit is due
- **Never visited:** If property was created 14+ days ago and has no visits, it's immediately due
- **Occupied determination:** Uses existing booking data and owner-stay status — no new status field

### Property Cards (Admin — `/properties`)
- Each property card shows "Last visit: [date]" notation
- Color indicator: red if overdue (past 14-day mark), green if on track

### Property Detail Page (Admin — `/properties/[id]`)
- New "Visits" section — positioned as the **first section**, before bookings
- Shows last 3-5 visits as a compact list
- Each row: date, number of checklist items completed, note preview
- "View all" link navigates to `/visits?property=[id]` (visits page filtered to that property)

### Log Visit Page (Admin — `/visits/new?property=[id]`)
- Full page (not dialog/bottom sheet)
- Accessible from "Log Visit" button on visits page rows and from property detail visits section
- Fields:
  - **Visit date** — date picker, defaults to today
  - **Checklist** — toggle checkboxes, only checked items are saved as "done"
  - **Photos & Videos** — upload to Supabase Storage, each can be marked public or private
  - **Note for Owner** — text field, visible to owner on their dashboard
  - **Private Note (Admin Only)** — text field with clear "ADMIN ONLY" labeling, dashed border. Used for future visit reminders (e.g., "bring screwdriver"). Shown inline on the visits page rows for the relevant property.

### Standard Checklist Items
All properties use the same checklist:
1. Electricity working
2. Run sinks
3. Run showers
4. Flush toilets
5. Refrigerator and Freezer working
6. Soap / toilet paper / etc in stock
7. Make sure boiler is off
8. Check washer door is open
9. Check dryer lint
10. Bedrooms no mold or leaking on walls
11. Check mailbox

### Owner Portal (Owner — `/owner`)
- New "Visits" section on the existing owner dashboard page
- Single combined list across all owner's properties
- Each visit row shows: property name, visit date, completed checklist items, public photos/videos, public note
- Expandable rows — click to see full details
- Only public media shown (private photos/videos filtered out by RLS)
- Private admin notes are NOT visible to owners

### Left Nav
- New "Visits" menu item added under Properties in the sidebar menu

---

## Data Model

### `visits` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Default `gen_random_uuid()` |
| property_id | uuid FK → properties | NOT NULL |
| visited_at | date | NOT NULL — when the visit happened |
| checklist | jsonb | Object with item keys → boolean. Only checked items stored as `true` |
| note | text | Public note visible to owner |
| admin_note | text | Private note — admin only, shown on visits page as reminder |
| created_by | uuid FK → auth.users | NOT NULL |
| created_at | timestamptz | Default `now()` |

### `visit_media` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Default `gen_random_uuid()` |
| visit_id | uuid FK → visits | NOT NULL, ON DELETE CASCADE |
| file_path | text | Supabase Storage path |
| file_type | text | `'image'` or `'video'` |
| is_private | boolean | Default `false`. Private = admin-only |
| created_at | timestamptz | Default `now()` |

### Checklist JSONB structure
Keys map to the standard checklist items:
```json
{
  "electricity_working": true,
  "run_sinks": true,
  "run_showers": true,
  "flush_toilets": true,
  "refrigerator_freezer": true,
  "soap_stock": true,
  "boiler_off": true,
  "washer_door_open": true,
  "dryer_lint": true,
  "bedrooms_no_mold": true,
  "check_mailbox": true
}
```
Only checked items are stored. Unchecked items are omitted (not stored as `false`).

### Checklist key-to-label mapping
| Key | Label |
|-----|-------|
| `electricity_working` | Electricity working |
| `run_sinks` | Run sinks |
| `run_showers` | Run showers |
| `flush_toilets` | Flush toilets |
| `refrigerator_freezer` | Refrigerator and Freezer working |
| `soap_stock` | Soap / toilet paper / etc in stock |
| `boiler_off` | Make sure boiler is off |
| `washer_door_open` | Check washer door is open |
| `dryer_lint` | Check dryer lint |
| `bedrooms_no_mold` | Bedrooms no mold or leaking on walls |
| `check_mailbox` | Check mailbox |

### Schedule computation (pseudo-SQL)
```sql
next_visit_due = GREATEST(
  COALESCE(last_visit_date, property_created_at),
  COALESCE(last_checkout_date, '1970-01-01')
) + INTERVAL '14 days'
```
- If no visits and no recent checkout: 14 days from property creation
- If occupied: property excluded from This Week / Later entirely

### RLS Policies
- **visits:** Admin has full CRUD. Owners can SELECT visits for their own properties.
- **visit_media:** Admin has full CRUD. Owners can SELECT where `is_private = false` for their own properties.
- Ownership check: `visits.property_id → properties.owner_id = auth.uid()`

### Storage
- Bucket: `visit-media` (new Supabase Storage bucket)
- Path pattern: `{property_id}/{visit_id}/{filename}`
- RLS on storage: admin can upload/delete, owners can read public files for their properties

---

## UI Patterns

All UI follows the existing Ledger design direction:
- White cards with `rounded-[10px]`, `border-border`, `shadow-sm`
- Section headers: `text-xs font-semibold uppercase tracking-widest text-muted-foreground`
- Copper accent (`#E8734A`) for primary CTA buttons
- Inter font for text, IBM Plex Mono for numbers/dates
- Row pattern: `px-4 py-3.5` with `border-t border-border` separators (matches tasks page)

---

## Out of Scope
- Custom checklists per property (same list for all)
- Visit scheduling/reminders/push notifications
- Contractor visit logging (admin only for now)
- Bulk visit logging (one property at a time)
