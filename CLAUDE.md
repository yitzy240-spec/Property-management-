# ApartmentOS

## Project Context
Property management platform for Jerusalem-based short-term rental & private property management.
Mobile-first PWA (structured for future Android native conversion) + web admin dashboard.

## Target Users
- **Admin** — Property manager (single user initially, ~20 properties)
- **Owners** — 3 tiers: Investor, Hybrid, Private (each sees different feature sets)
- **Contractors** — Access via magic links (no login required)
- **Guests** — View-only check-in pages with live entry codes

## Tech Stack
- **Framework:** Next.js 14+ (App Router) with TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions, RLS)
- **Hosting:** Vercel
- **PWA:** next-pwa for installable mobile experience
- **State:** Zustand for client state, React Query for server state

## External Integrations
- **Lodgify API** — Financial data (gross rental, channel fees) for commission calc
- **iCal feeds** — Booking calendar sync from Airbnb, Booking.com, Lodgify
- **Gmail API** — Bill parsing (OAuth, reads PDF attachments)
- **Green Invoice API** — Hebrew/English invoice generation
- **AI Bill Parsing** — Claude Haiku or Gemini Flash for PDF extraction
- **Resend** — Transactional email notifications

## Key Directories
```
src/
├── app/              # Next.js App Router pages
│   ├── (admin)/      # Admin dashboard routes
│   ├── (owner)/      # Owner portal routes
│   ├── contractor/   # Magic link contractor pages (public)
│   ├── guest/        # Guest check-in pages (public)
│   └── api/          # API routes
├── components/
│   ├── ui/           # shadcn/ui base components
│   ├── layout/       # Shell, sidebar, nav components
│   └── features/     # Feature-specific components
├── lib/              # Utilities, Supabase client, API helpers
├── hooks/            # Custom React hooks
├── types/            # TypeScript type definitions
└── styles/           # Global styles, Tailwind config
supabase/
├── migrations/       # SQL migration files (ordered)
└── functions/        # Edge Functions (cron jobs, webhooks)
public/               # Static assets, PWA manifest
docs/                 # Architecture decisions, API docs
```

## Code Style & Conventions
- **Language:** TypeScript strict mode, no `any`
- **Components:** Functional components with named exports
- **Naming:** kebab-case files, PascalCase components, camelCase functions/variables
- **Currency:** Always stored as integer agorot (ILS × 100) in DB, formatted on display
- **Dates:** Store as UTC in DB, display in Asia/Jerusalem timezone
- **IDs:** Use Supabase UUIDs
- **API Keys:** Stored encrypted in Supabase `app_settings` table, managed via admin UI

## Testing Strategy
- Vitest for unit tests
- Playwright for E2E (critical flows: login, magic link, bill approval)
- Run: `npm test` (unit), `npm run test:e2e` (E2E)

## Build & Deploy
- `npm run dev` — local dev server
- `npm run build` — production build
- Auto-deploy to Vercel on push to `main`
- Supabase migrations: `npx supabase db push`

## Important Notes
- All financial amounts in agorot (integer) to avoid floating point issues
- RLS policies on every table — owners see only their properties
- Magic links use signed JWT tokens with expiry, stored in `magic_links` table
- iCal sync runs as a Supabase cron edge function every 15 minutes
- Bill parsing is async: Gmail webhook → Edge Function → AI parse → verification queue
- VAT threshold (Osek Patur): ₪122,833 — tracked in admin dashboard
- Seasonal maintenance auto-scheduling based on Jerusalem calendar
