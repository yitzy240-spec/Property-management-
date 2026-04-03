-- ApartmentOS: RLS Security Fixes
-- Addresses CTO audit findings: missing RLS on 6 tables, missing policies on 4 tables

-- ============================================
-- ENABLE RLS ON MISSING TABLES
-- ============================================

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CRITICAL: app_settings — NO client access (service role only)
-- API keys must never be readable by authenticated users
-- ============================================

-- No SELECT/INSERT/UPDATE/DELETE policies = service role only access

-- ============================================
-- CRITICAL: magic_links — NO general access
-- Tokens validated server-side via service role only
-- ============================================

-- No SELECT policy for authenticated users
-- Admin reads via service role, token validation via service role

-- ============================================
-- contractors — owners can see contractors assigned to their tasks
-- ============================================

CREATE POLICY "Owners see contractors on their tasks"
  ON contractors FOR SELECT
  USING (
    id IN (
      SELECT t.contractor_id FROM tasks t
      JOIN properties p ON t.property_id = p.id
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );

-- ============================================
-- revenue_tracking — admin only (service role)
-- ============================================

-- No policies = service role only access (business-sensitive)

-- ============================================
-- seasonal_templates — read-only for authenticated users
-- ============================================

CREATE POLICY "Authenticated users can read templates"
  ON seasonal_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================
-- laundry_batches — owners see their property batches
-- ============================================

CREATE POLICY "Owners see own laundry batches"
  ON laundry_batches FOR SELECT
  USING (property_id IN (
    SELECT p.id FROM properties p
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

-- ============================================
-- MISSING POLICIES ON TABLES WITH RLS ALREADY ENABLED
-- ============================================

-- task_checklist_items: owners see via task -> property chain
CREATE POLICY "Owners see own checklist items"
  ON task_checklist_items FOR SELECT
  USING (task_id IN (
    SELECT t.id FROM tasks t
    JOIN properties p ON t.property_id = p.id
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

-- task_media: owners see via task -> property chain
CREATE POLICY "Owners see own task media"
  ON task_media FOR SELECT
  USING (task_id IN (
    SELECT t.id FROM tasks t
    JOIN properties p ON t.property_id = p.id
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

-- inventory_items: owners see their property inventory
CREATE POLICY "Owners see own inventory"
  ON inventory_items FOR SELECT
  USING (property_id IN (
    SELECT p.id FROM properties p
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

-- fee_entries: owners see fee entries for their properties
CREATE POLICY "Owners see own fee entries"
  ON fee_entries FOR SELECT
  USING (property_id IN (
    SELECT p.id FROM properties p
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

-- ============================================
-- MISSING INDEXES FOR RLS PERFORMANCE
-- ============================================

CREATE INDEX idx_owners_auth_user ON owners(auth_user_id);
CREATE INDEX idx_fee_entries_property ON fee_entries(property_id);
CREATE INDEX idx_magic_links_expires ON magic_links(expires_at);
CREATE INDEX idx_laundry_batches_property ON laundry_batches(property_id);
