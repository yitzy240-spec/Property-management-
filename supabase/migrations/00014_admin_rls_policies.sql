-- ApartmentOS: Admin RLS policies
-- Admin users (role = 'admin' in app_metadata) get full access to all tables.
-- This allows client-side Supabase queries from admin components to work.

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Properties
CREATE POLICY "Admin full access on properties" ON properties FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Owners
CREATE POLICY "Admin full access on owners" ON owners FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Bookings
CREATE POLICY "Admin full access on bookings" ON bookings FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Bills
CREATE POLICY "Admin full access on bills" ON bills FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Tasks
CREATE POLICY "Admin full access on tasks" ON tasks FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Task checklist items
CREATE POLICY "Admin full access on task_checklist_items" ON task_checklist_items FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Task media
CREATE POLICY "Admin full access on task_media" ON task_media FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Fee entries
CREATE POLICY "Admin full access on fee_entries" ON fee_entries FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Documents
CREATE POLICY "Admin full access on documents" ON documents FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Inventory items
CREATE POLICY "Admin full access on inventory_items" ON inventory_items FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Laundry batches
CREATE POLICY "Admin full access on laundry_batches" ON laundry_batches FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Messages
CREATE POLICY "Admin full access on messages" ON messages FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Contractors
CREATE POLICY "Admin full access on contractors" ON contractors FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Seasonal templates
CREATE POLICY "Admin full access on seasonal_templates" ON seasonal_templates FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Revenue tracking
CREATE POLICY "Admin full access on revenue_tracking" ON revenue_tracking FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- App settings
CREATE POLICY "Admin full access on app_settings" ON app_settings FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Magic links
CREATE POLICY "Admin full access on magic_links" ON magic_links FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Bill sender mappings
CREATE POLICY "Admin full access on bill_sender_mappings" ON bill_sender_mappings FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Bill schedules
CREATE POLICY "Admin full access on bill_schedules" ON bill_schedules FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Property utility accounts (already has admin policy from migration 00012, skip if exists)
DO $$ BEGIN
  CREATE POLICY "Admin full access on property_utility_accounts_v2" ON property_utility_accounts FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner reports
DO $$ BEGIN
  CREATE POLICY "Admin full access on owner_reports" ON owner_reports FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
