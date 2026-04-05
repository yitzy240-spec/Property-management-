-- ApartmentOS: AI Features schema changes
-- Supports: doc auto-filing, seasonal checklists, guest guides,
-- owner reports, snap-to-task, smart reply, linen forecasting

-- 1. Document auto-filing
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_classified BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_classification_data JSONB;

-- 2. Seasonal checklist AI items
ALTER TABLE task_checklist_items ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false;

-- 3. Property additions for AI features
ALTER TABLE properties ADD COLUMN IF NOT EXISTS maintenance_notes TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS guest_guide_base_text TEXT;

-- 4. Booking language for guest guide translation
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_language TEXT DEFAULT 'en';

-- 5. Guest guide cache (per property + language)
CREATE TABLE IF NOT EXISTS guest_guide_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  guide_content TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_guest_guide_cache_property ON guest_guide_cache(property_id);

-- 6. Owner reports with approval flow
DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('draft', 'approved', 'sent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS owner_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year INTEGER NOT NULL,
  report_data JSONB NOT NULL,
  ai_narrative_en TEXT,
  ai_narrative_he TEXT,
  edited_narrative_en TEXT,
  edited_narrative_he TEXT,
  status report_status NOT NULL DEFAULT 'draft',
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_via TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, quarter, year)
);

ALTER TABLE owner_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners see own reports"
  ON owner_reports FOR SELECT
  USING (owner_id IN (SELECT id FROM owners WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role full access on owner_reports"
  ON owner_reports FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_owner_reports_owner ON owner_reports(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_reports_status ON owner_reports(status);

CREATE TRIGGER set_updated_at_owner_reports BEFORE UPDATE ON owner_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
