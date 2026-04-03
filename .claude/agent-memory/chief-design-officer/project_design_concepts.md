---
name: ApartmentOS Design Language Concepts
description: Four named design concepts defined for ApartmentOS — palette, type, radius, shadow, and philosophy for each
type: project
---

Four design language concepts were defined on 2026-04-03. The spec lives at `docs/design-language-concepts.md`.

**Concept 1: Jerusalem Stone**
- Primary: #1E3A5F (navy), Secondary/accent: #C9A96E (warm gold)
- Surfaces: warm off-white (#FAFAF8, #F5F3EF, #EDE9E2) — not pure white
- Type: Inter + Newsreader (serif at narrative moments only) + IBM Plex Mono for data
- Shadows: warm amber-undertone, shadow-md at rest, shadow-lg on active
- Radius: 4/8/12/16/full
- Identity: Jerusalem material warmth, gold = financial positive signal
- Recommended for Marcus Properties as primary direction

**Concept 2: Tel Aviv Office**
- Primary: #0F172A (slate), Accent: #3B82F6 (blue)
- Pure white surfaces, cool blue shadows
- Type: Inter + Geist Mono — no serif anywhere. Uppercase overlines for section labels
- Left-border active selection pattern (4px blue) instead of background fill
- Radius: 3/6/10/14/full — tightest radii of all concepts
- Best for: admin power-user, fast-scanning dashboards

**Concept 3: Garden Apartment**
- Primary: #2D6A4F (forest green), surface has green tint (#FAFEFA)
- Type: Funnel Sans + Playfair Display (guest/owner covers only) + Geist Mono
- Bento tile home screen for owners, pill-first filtering, property photo strip on cards
- Radius: 6/10/16/20/full — most generous/consumer-app feeling
- Best for: guest check-in, Hybrid/Private owner portal

**Concept 4: Operations Mode**
- Primary: #111827 (near-black), Accent: #F59E0B (amber)
- Cards use border-based elevation (1px + 2px bottom) not shadows
- Type: Inter heavy (800/700/600) + IBM Plex Mono — body at 15px for outdoor legibility
- Radius: 2/4/8/12/full — sharpest corners, most utilitarian
- 52px min touch targets, 60px for primary actions
- Best for: contractor checklist views, Investor-tier owner (4-number summary), admin on mobile

**Cross-concept decisions locked:**
- Font feature: tabular-nums always on for currency
- ILS format: ₪X,XXX.XX
- Income = safe color, expense = danger color
- All layout tokens use logical properties (inline-start/end, not left/right) for RTL
- Min touch target: 44px (Concept 4: 52px)

**Recommendation:** Jerusalem Stone as primary; Concept 4 checklist patterns for contractor views regardless of chosen concept.

**Why:** Needs to be warm enough for Jerusalem guest welcome, professional enough for owner financial reports, and have a local identity. Gold accent creates natural semantic emphasis on financial data.

**How to apply:** When designing any screen, default to Jerusalem Stone tokens. For contractor magic-link views, apply Operations Mode touch targets and checklist density regardless of overall concept chosen.
