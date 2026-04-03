-- ApartmentOS: Initial Database Schema
-- All amounts stored as integer agorot (ILS × 100)

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE owner_profile AS ENUM ('investor', 'hybrid', 'private');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE bill_type AS ENUM ('arnona', 'iec', 'water', 'vaad_bayit', 'internet', 'gas', 'other');
CREATE TYPE bill_status AS ENUM ('pending_review', 'approved', 'flagged', 'rejected');
CREATE TYPE magic_link_type AS ENUM ('contractor', 'cleaner', 'guest');
CREATE TYPE inventory_status AS ENUM ('in_closet', 'at_laundry', 'damaged', 'retired');
CREATE TYPE fee_type AS ENUM ('commission', 'hourly', 'fixed');
CREATE TYPE document_category AS ENUM ('tabu', 'insurance', 'contract', 'warranty', 'receipt', 'other');
CREATE TYPE season_type AS ENUM ('rain_roof', 'boiler_heating', 'ac_clean');

-- ============================================
-- OWNERS
-- ============================================

CREATE TABLE owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  profile owner_profile NOT NULL DEFAULT 'hybrid',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- PROPERTIES
-- ============================================

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Jerusalem',
  neighborhood TEXT,
  num_bedrooms INTEGER NOT NULL DEFAULT 1,
  num_beds INTEGER NOT NULL DEFAULT 1,
  entry_code TEXT,                          -- Live door/lockbox code
  entry_code_updated_at TIMESTAMPTZ,
  youtube_tutorial_url TEXT,                -- Video guide for this apartment
  canva_design_url TEXT,                    -- Canva embed for guest page
  ical_feed_urls JSONB DEFAULT '[]'::jsonb, -- Array of {platform, url} for booking sync
  lodgify_property_id TEXT,                 -- Lodgify ID for financial data
  management_fee_agorot INTEGER DEFAULT 0,  -- Fixed monthly fee in agorot
  hourly_rate_agorot INTEGER DEFAULT 0,     -- Hourly rate for billable tasks
  commission_rate NUMERIC(5,4) DEFAULT 0.20,-- Default 20%
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- BOOKINGS (synced from iCal feeds)
-- ============================================

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  platform TEXT,                -- 'airbnb', 'booking_com', 'lodgify', 'direct'
  external_id TEXT,             -- ID from the platform
  guest_name TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  gross_rental_agorot INTEGER,  -- From Lodgify API
  channel_fees_agorot INTEGER,  -- From Lodgify API
  ical_uid TEXT,                -- iCal UID for dedup
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, ical_uid)
);

-- ============================================
-- BILLS & EXPENSES
-- ============================================

CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  bill_type bill_type NOT NULL,
  amount_agorot INTEGER NOT NULL,
  due_date DATE,
  billing_period_start DATE,
  billing_period_end DATE,
  status bill_status NOT NULL DEFAULT 'pending_review',
  is_anomaly BOOLEAN DEFAULT false,         -- >20% above 3-month avg
  anomaly_note TEXT,
  pdf_storage_path TEXT,                    -- Supabase Storage path
  gmail_message_id TEXT,                    -- Source Gmail message
  ai_parsed_data JSONB,                     -- Raw AI extraction output
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TASKS & MAINTENANCE
-- ============================================

CREATE TABLE contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  specialty TEXT,               -- 'plumber', 'electrician', 'cleaner', 'general'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'normal',
  is_seasonal BOOLEAN DEFAULT false,
  season_type season_type,
  is_routine_check BOOLEAN DEFAULT false,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  billable_hours NUMERIC(5,2) DEFAULT 0,
  expense_agorot INTEGER DEFAULT 0,
  receipt_storage_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Checklist items within a task
CREATE TABLE task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Media attachments for tasks (photos/videos)
CREATE TABLE task_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  media_type TEXT NOT NULL,     -- 'image', 'video'
  caption TEXT,
  uploaded_by TEXT,             -- contractor name or 'admin'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- MAGIC LINKS
-- ============================================

CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  link_type magic_link_type NOT NULL,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INVENTORY & LAUNDRY
-- ============================================

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,      -- 'sheets_single', 'towels_bath', etc.
  quantity INTEGER NOT NULL DEFAULT 0,
  status inventory_status NOT NULL DEFAULT 'in_closet',
  par_level INTEGER,            -- Minimum "in_closet" threshold (2× beds)
  last_counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE laundry_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  items JSONB NOT NULL,         -- [{item_name, quantity}]
  sent_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  laundry_provider_notified BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- FINANCIALS
-- ============================================

CREATE TABLE fee_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  fee_type fee_type NOT NULL,
  amount_agorot INTEGER NOT NULL,
  description TEXT,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  billing_month DATE NOT NULL,  -- First of month, e.g. '2026-04-01'
  pushed_to_invoice BOOLEAN DEFAULT false,
  invoice_id TEXT,              -- Green Invoice ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VAT tracking (Osek Patur threshold)
CREATE TABLE revenue_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  total_revenue_agorot INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(year, month)
);

-- ============================================
-- DOCUMENT VAULT
-- ============================================

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES owners(id) ON DELETE CASCADE,
  category document_category NOT NULL,
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT NOT NULL,    -- 'admin' or 'owner'
  expiry_date DATE,            -- For insurance, contracts
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- APP SETTINGS (Admin-managed API keys)
-- ============================================

CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,          -- Encrypted at application layer
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- SEASONAL MAINTENANCE TEMPLATES
-- ============================================

CREATE TABLE seasonal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_type season_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  checklist_items JSONB DEFAULT '[]'::jsonb,
  month_trigger INTEGER NOT NULL,  -- 1-12, when to auto-create
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Insert default Jerusalem seasonal templates
INSERT INTO seasonal_templates (season_type, title, description, checklist_items, month_trigger) VALUES
  ('rain_roof', 'Rain & Roof Inspection', 'Pre-rainy season roof and drainage check', '["Check roof for cracks/damage", "Clear drainage pipes", "Inspect window seals", "Check for water stains on ceilings"]', 9),
  ('boiler_heating', 'Boiler & Heating Check', 'Pre-winter heating system inspection', '["Test boiler ignition", "Check radiator valves", "Bleed radiators if needed", "Verify thermostat function", "Check gas connections"]', 10),
  ('ac_clean', 'AC Deep Clean & Filter Replacement', 'Pre-summer air conditioning maintenance', '["Clean AC filters", "Deep clean indoor units", "Check outdoor unit", "Test cooling efficiency", "Check remote batteries"]', 3);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_entries ENABLE ROW LEVEL SECURITY;

-- Admin can see everything (service role bypasses RLS)
-- Owner policies: can only see their own properties and related data

CREATE POLICY "Owners see own record"
  ON owners FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Owners see own properties"
  ON properties FOR SELECT
  USING (owner_id IN (SELECT id FROM owners WHERE auth_user_id = auth.uid()));

CREATE POLICY "Owners see own bookings"
  ON bookings FOR SELECT
  USING (property_id IN (
    SELECT p.id FROM properties p
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

CREATE POLICY "Owners see approved bills"
  ON bills FOR SELECT
  USING (
    status = 'approved'
    AND property_id IN (
      SELECT p.id FROM properties p
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Owners see own tasks"
  ON tasks FOR SELECT
  USING (property_id IN (
    SELECT p.id FROM properties p
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

CREATE POLICY "Owners see own documents"
  ON documents FOR SELECT
  USING (
    owner_id IN (SELECT id FROM owners WHERE auth_user_id = auth.uid())
    OR property_id IN (
      SELECT p.id FROM properties p
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Owners manage own documents"
  ON documents FOR INSERT
  WITH CHECK (
    owner_id IN (SELECT id FROM owners WHERE auth_user_id = auth.uid())
  );

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_bookings_property ON bookings(property_id);
CREATE INDEX idx_bookings_dates ON bookings(check_in, check_out);
CREATE INDEX idx_bills_property ON bills(property_id);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_tasks_property ON tasks(property_id);
CREATE INDEX idx_tasks_contractor ON tasks(contractor_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_fee_entries_month ON fee_entries(billing_month);
CREATE INDEX idx_documents_property ON documents(property_id);
CREATE INDEX idx_inventory_property ON inventory_items(property_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON owners FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
