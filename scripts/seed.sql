-- ApartmentOS Seed Data
-- Realistic Jerusalem properties, owners, bookings, bills, tasks, contractors
-- Run after migrations: psql $DATABASE_URL -f scripts/seed.sql

-- ============================================
-- OWNERS
-- ============================================

INSERT INTO owners (id, full_name, email, phone, profile) VALUES
  ('11111111-0000-0000-0000-000000000001', 'David Cohen', 'david@example.com', '+972-50-111-1111', 'investor'),
  ('11111111-0000-0000-0000-000000000002', 'Rachel Levi', 'rachel@example.com', '+972-50-222-2222', 'hybrid'),
  ('11111111-0000-0000-0000-000000000003', 'Michael Ben-Ari', 'michael@example.com', '+972-50-333-3333', 'private');

-- ============================================
-- PROPERTIES
-- ============================================

INSERT INTO properties (id, owner_id, name, address, city, neighborhood, num_bedrooms, num_beds, entry_code, youtube_tutorial_url, commission_rate, management_fee_agorot, hourly_rate_agorot) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Ben Yehuda 42', '42 Ben Yehuda Street', 'Jerusalem', 'City Center', 2, 3, '4829', 'https://youtube.com/watch?v=example1', 0.20, 50000, 15000),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Emek Refaim 15', '15 Emek Refaim Street', 'Jerusalem', 'German Colony', 3, 4, '7351', 'https://youtube.com/watch?v=example2', 0.20, 60000, 15000),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'King George 8', '8 King George Street', 'Jerusalem', 'City Center', 1, 2, '9142', NULL, 0.20, 40000, 15000),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000002', 'Beit HaKerem 22', '22 HaArazim Street', 'Jerusalem', 'Beit HaKerem', 2, 3, '5567', 'https://youtube.com/watch?v=example4', 0.20, 50000, 15000),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003', 'Katamon Villa', '5 Rachel Imeinu Street', 'Jerusalem', 'Katamon', 4, 6, '2283', NULL, 0.15, 80000, 15000);

-- ============================================
-- CONTRACTORS
-- ============================================

INSERT INTO contractors (id, name, phone, email, specialty) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Shmuel Cohen', '+972-50-444-4444', 'shmuel@example.com', 'plumber'),
  ('33333333-0000-0000-0000-000000000002', 'Yossi Plumbing', '+972-50-555-5555', 'yossi@example.com', 'plumber'),
  ('33333333-0000-0000-0000-000000000003', 'Miriam Cleaning', '+972-50-666-6666', 'miriam@example.com', 'cleaner'),
  ('33333333-0000-0000-0000-000000000004', 'Avi Electric', '+972-50-777-7777', 'avi@example.com', 'electrician');

-- ============================================
-- BOOKINGS (recent and upcoming)
-- ============================================

INSERT INTO bookings (property_id, platform, guest_name, check_in, check_out, gross_rental_agorot, channel_fees_agorot, ical_uid) VALUES
  -- Ben Yehuda 42
  ('22222222-0000-0000-0000-000000000001', 'airbnb', 'Yael Cohen', '2026-04-01', '2026-04-05', 450000, 45000, 'uid-001@airbnb'),
  ('22222222-0000-0000-0000-000000000001', 'booking_com', 'Thomas Mueller', '2026-04-08', '2026-04-12', 520000, 78000, 'uid-002@booking'),
  ('22222222-0000-0000-0000-000000000001', 'airbnb', 'Sarah Johnson', '2026-04-15', '2026-04-22', 840000, 84000, 'uid-003@airbnb'),
  -- Emek Refaim 15
  ('22222222-0000-0000-0000-000000000002', 'airbnb', 'David Levy', '2026-04-03', '2026-04-07', 680000, 68000, 'uid-004@airbnb'),
  ('22222222-0000-0000-0000-000000000002', 'direct', 'Anna Schmidt', '2026-04-10', '2026-04-17', 950000, 0, 'uid-005@direct'),
  -- King George 8
  ('22222222-0000-0000-0000-000000000003', 'booking_com', 'Pierre Dubois', '2026-04-05', '2026-04-08', 360000, 54000, 'uid-006@booking'),
  ('22222222-0000-0000-0000-000000000003', 'airbnb', 'Maria Garcia', '2026-04-12', '2026-04-18', 540000, 54000, 'uid-007@airbnb'),
  -- Beit HaKerem 22
  ('22222222-0000-0000-0000-000000000004', 'lodgify', 'Robert Kim', '2026-04-02', '2026-04-06', 480000, 48000, 'uid-008@lodgify'),
  -- Katamon Villa (owner stay)
  ('22222222-0000-0000-0000-000000000005', 'owner_stay', 'Michael Ben-Ari (Owner Stay)', '2026-04-10', '2026-04-14', NULL, NULL, 'uid-009@owner');

-- ============================================
-- BILLS
-- ============================================

INSERT INTO bills (property_id, bill_type, amount_agorot, due_date, status, is_anomaly, anomaly_note) VALUES
  ('22222222-0000-0000-0000-000000000001', 'arnona', 85000, '2026-04-15', 'approved', false, NULL),
  ('22222222-0000-0000-0000-000000000001', 'iec', 42000, '2026-04-20', 'pending_review', false, NULL),
  ('22222222-0000-0000-0000-000000000001', 'water', 18000, '2026-04-18', 'approved', false, NULL),
  ('22222222-0000-0000-0000-000000000002', 'arnona', 92000, '2026-04-15', 'approved', false, NULL),
  ('22222222-0000-0000-0000-000000000002', 'iec', 78000, '2026-04-20', 'flagged', true, '85% above 3-month average'),
  ('22222222-0000-0000-0000-000000000003', 'vaad_bayit', 35000, '2026-04-01', 'approved', false, NULL),
  ('22222222-0000-0000-0000-000000000003', 'water', 12000, '2026-04-18', 'pending_review', false, NULL),
  ('22222222-0000-0000-0000-000000000004', 'arnona', 68000, '2026-04-15', 'approved', false, NULL),
  ('22222222-0000-0000-0000-000000000005', 'arnona', 120000, '2026-04-15', 'approved', false, NULL),
  ('22222222-0000-0000-0000-000000000005', 'gas', 25000, '2026-04-10', 'pending_review', false, NULL);

-- ============================================
-- TASKS
-- ============================================

INSERT INTO tasks (id, property_id, contractor_id, title, description, status, priority, is_seasonal, is_cleaning, due_date, billable_hours, expense_agorot) VALUES
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'Fix kitchen faucet leak', 'Guest reported dripping kitchen faucet', 'in_progress', 'high', false, false, '2026-04-05', 0, 0),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 'Turnover clean — Ben Yehuda 42', 'Post-checkout cleaning for Yael Cohen', 'pending', 'high', false, true, '2026-04-05', 0, 0),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000004', 'Replace bathroom light fixture', 'Flickering light in main bathroom', 'pending', 'normal', false, false, '2026-04-08', 1.5, 8500),
  ('44444444-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', NULL, 'AC Deep Clean — Emek Refaim 15', 'Seasonal pre-summer maintenance', 'pending', 'normal', true, false, '2026-04-15', 0, 0),
  ('44444444-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000003', 'Turnover clean — King George 8', 'Post-checkout cleaning', 'completed', 'high', false, true, '2026-04-04', 2, 0),
  ('44444444-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', 'Boiler annual inspection', 'Seasonal boiler check before winter', 'completed', 'normal', true, false, '2026-03-20', 1, 12000),
  ('44444444-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000005', NULL, 'Roof inspection — Katamon Villa', 'Pre-rainy season check', 'pending', 'normal', true, false, '2026-04-20', 0, 0);

-- Checklist items for the faucet repair task
INSERT INTO task_checklist_items (task_id, label, is_completed, sort_order) VALUES
  ('44444444-0000-0000-0000-000000000001', 'Turn off water supply', true, 0),
  ('44444444-0000-0000-0000-000000000001', 'Replace faucet cartridge', false, 1),
  ('44444444-0000-0000-0000-000000000001', 'Test for leaks', false, 2),
  ('44444444-0000-0000-0000-000000000001', 'Clean work area', false, 3);

-- Checklist for cleaning task
INSERT INTO task_checklist_items (task_id, label, is_completed, sort_order) VALUES
  ('44444444-0000-0000-0000-000000000002', 'Flush all toilets (Nia check)', false, 0),
  ('44444444-0000-0000-0000-000000000002', 'Run all sinks', false, 1),
  ('44444444-0000-0000-0000-000000000002', 'Check boiler pilot', false, 2),
  ('44444444-0000-0000-0000-000000000002', 'Inspect window seals', false, 3),
  ('44444444-0000-0000-0000-000000000002', 'Test AC remote', false, 4),
  ('44444444-0000-0000-0000-000000000002', 'Final photo of staged apartment', false, 5);

-- ============================================
-- INVENTORY
-- ============================================

INSERT INTO inventory_items (property_id, item_name, quantity_in_closet, quantity_at_laundry, quantity_damaged, par_level) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Bath towels', 8, 4, 0, 6),
  ('22222222-0000-0000-0000-000000000001', 'Bed sheets (double)', 4, 2, 0, 4),
  ('22222222-0000-0000-0000-000000000001', 'Pillowcases', 8, 4, 1, 6),
  ('22222222-0000-0000-0000-000000000002', 'Bath towels', 10, 2, 0, 8),
  ('22222222-0000-0000-0000-000000000002', 'Bed sheets (double)', 6, 2, 0, 4),
  ('22222222-0000-0000-0000-000000000003', 'Bath towels', 3, 3, 0, 4),  -- Below par!
  ('22222222-0000-0000-0000-000000000003', 'Bed sheets (single)', 2, 2, 0, 4),  -- Below par!
  ('22222222-0000-0000-0000-000000000004', 'Bath towels', 6, 4, 0, 6),
  ('22222222-0000-0000-0000-000000000005', 'Bath towels', 12, 0, 0, 12),
  ('22222222-0000-0000-0000-000000000005', 'Bed sheets (king)', 4, 0, 0, 4);

-- ============================================
-- REVENUE TRACKING (YTD)
-- ============================================

INSERT INTO revenue_tracking (year, month, total_revenue_agorot) VALUES
  (2026, 1, 2850000),
  (2026, 2, 3120000),
  (2026, 3, 3480000);

-- ============================================
-- DOCUMENTS (Vault)
-- ============================================

INSERT INTO documents (property_id, owner_id, category, title, storage_path, uploaded_by) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'tabu', 'Tabu Extract — Ben Yehuda 42', 'vault/tabu-ben-yehuda.pdf', 'admin'),
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'insurance', 'Insurance Policy 2026', 'vault/insurance-ben-yehuda.pdf', 'admin'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'contract', 'Management Agreement', 'vault/contract-emek-refaim.pdf', 'owner'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003', 'tabu', 'Tabu — Katamon Villa', 'vault/tabu-katamon.pdf', 'owner'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003', 'insurance', 'Home Insurance 2026', 'vault/insurance-katamon.pdf', 'admin');
