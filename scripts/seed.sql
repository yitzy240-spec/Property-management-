-- ApartmentOS Seed Data — From Real Client Data (Marcus Properties)
-- Credit card numbers, passport numbers, and sensitive PII have been REDACTED
-- Run after migrations: paste into Supabase SQL Editor

-- ============================================
-- OWNERS (real owners, redacted PII)
-- ============================================

INSERT INTO owners (id, full_name, email, phone, profile, notes) VALUES
  ('11111111-aaaa-0000-0000-000000000001', 'Bobbi & Michelle Luxenberg', 'bobbi@example.com', NULL, 'investor', 'הרכבת 20 — Savyon View. Mgmt fee $270/mo'),
  ('11111111-aaaa-0000-0000-000000000002', 'Kalman Finkelstein', 'kalman@example.com', '+1-443-495-9897', 'hybrid', 'Agripas 6. Mgmt fee $150/mo'),
  ('11111111-aaaa-0000-0000-000000000003', 'Benjamin Strauss', 'ben@example.com', '+1-443-487-3733', 'investor', 'Owns Agripas 8 + Raul Wallenberg 3. Mgmt fee $150/mo each'),
  ('11111111-aaaa-0000-0000-000000000004', 'Dena & Aaron Finkelstein', 'dena@example.com', '+1-443-799-9922', 'private', 'Keren Hayesod 5 Apt 3. Mgmt fee $100/mo');

-- ============================================
-- PROPERTIES (real addresses in Jerusalem)
-- ============================================

INSERT INTO properties (id, owner_id, name, address, city, neighborhood, num_bedrooms, num_beds, entry_code, commission_rate, management_fee_agorot, hourly_rate_agorot) VALUES
  ('22222222-aaaa-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'Savyon View', 'הרכבת 20, דירה 3', 'Jerusalem', 'City Center', 2, 3, '4829', 0.20, 99900, 15000),
  ('22222222-aaaa-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000002', 'Agripas 6', 'Agripas 6, Apt 7', 'Jerusalem', 'City Center', 2, 3, '7351', 0.20, 55500, 15000),
  ('22222222-aaaa-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000003', 'Agripas 8', 'Agripas 8, Apt B', 'Jerusalem', 'City Center', 2, 3, '9142', 0.20, 55500, 15000),
  ('22222222-aaaa-0000-0000-000000000004', '11111111-aaaa-0000-0000-000000000003', 'Raul Wallenberg', 'Raul Wallenberg 3, Apt 33', 'Jerusalem', 'Ramot', 2, 3, '5567', 0.20, 55500, 15000),
  ('22222222-aaaa-0000-0000-000000000005', '11111111-aaaa-0000-0000-000000000004', 'Keren Hayesod 5', '5 Keren Hayesod, Apt 3', 'Jerusalem', 'City Center', 3, 4, '2283', 0.20, 37000, 15000);

-- ============================================
-- CONTRACTORS
-- ============================================

INSERT INTO contractors (id, name, phone, email, specialty) VALUES
  ('33333333-aaaa-0000-0000-000000000001', 'Shmuel Cohen', '+972-50-444-4444', NULL, 'plumber'),
  ('33333333-aaaa-0000-0000-000000000002', 'Miriam Cleaning', '+972-50-666-6666', NULL, 'cleaner'),
  ('33333333-aaaa-0000-0000-000000000003', 'Avi Electric', '+972-50-777-7777', NULL, 'electrician');

-- ============================================
-- BOOKINGS (from real Invoices sheet — amounts converted to agorot)
-- USD amounts converted at ~3.7 ILS/USD for agorot
-- ============================================

INSERT INTO bookings (property_id, platform, guest_name, check_in, check_out, gross_rental_agorot, channel_fees_agorot, ical_uid) VALUES
  -- Savyon View bookings
  ('22222222-aaaa-0000-0000-000000000001', 'direct', 'Ari Storch', '2025-12-09', '2025-12-14', 647500, 0, 'uid-001@direct'),
  ('22222222-aaaa-0000-0000-000000000001', 'airbnb', 'Sara Solomon', '2025-12-23', '2025-12-28', 0, 0, 'uid-002@airbnb'),
  ('22222222-aaaa-0000-0000-000000000001', 'direct', 'Devora', '2025-10-16', '2025-11-10', 1924000, 0, 'uid-003@direct'),
  ('22222222-aaaa-0000-0000-000000000001', 'direct', 'Natan Cohen', '2025-09-29', '2025-10-16', 3700000, 0, 'uid-004@direct'),
  ('22222222-aaaa-0000-0000-000000000001', 'airbnb', 'מורן', '2025-08-18', '2025-08-21', 0, 0, 'uid-005@airbnb'),
  ('22222222-aaaa-0000-0000-000000000001', 'airbnb', 'Benjamin', '2025-08-21', '2025-08-24', 0, 0, 'uid-006@airbnb'),
  ('22222222-aaaa-0000-0000-000000000001', 'direct', 'Aryeh', '2025-07-31', '2025-08-18', 1844500, 0, 'uid-007@direct'),

  -- Agripas 6 bookings
  ('22222222-aaaa-0000-0000-000000000002', 'direct', 'Eli (boys)', '2025-11-01', '2026-03-15', 6660000, 0, 'uid-008@direct'),
  ('22222222-aaaa-0000-0000-000000000002', 'direct', 'Zev Belsky', '2025-09-30', '2025-10-19', 3145000, 0, 'uid-009@direct'),
  ('22222222-aaaa-0000-0000-000000000002', 'airbnb', 'Marie', '2025-08-21', '2025-08-24', 0, 0, 'uid-010@airbnb'),
  ('22222222-aaaa-0000-0000-000000000002', 'airbnb', 'Simmy A', '2025-08-07', '2025-08-17', 0, 0, 'uid-011@airbnb'),
  ('22222222-aaaa-0000-0000-000000000002', 'direct', 'צביקה', '2025-09-22', '2025-09-24', 300000, 0, 'uid-012@direct'),

  -- Agripas 8 bookings
  ('22222222-aaaa-0000-0000-000000000003', 'direct', 'Sruly (boys)', '2025-10-27', '2026-03-20', 9250000, 0, 'uid-013@direct'),
  ('22222222-aaaa-0000-0000-000000000003', 'direct', 'Abe Belsky', '2025-09-28', '2025-10-27', 6660000, 0, 'uid-014@direct'),
  ('22222222-aaaa-0000-0000-000000000003', 'direct', 'Sara Steiner', '2025-09-22', '2025-09-24', 370000, 0, 'uid-015@direct'),
  ('22222222-aaaa-0000-0000-000000000003', 'direct', 'Yehuda', '2025-08-06', '2025-08-12', 1073000, 0, 'uid-016@direct'),
  ('22222222-aaaa-0000-0000-000000000003', 'airbnb', 'Avi', '2025-08-12', '2025-08-27', 0, 0, 'uid-017@airbnb'),

  -- Keren Hayesod 5 bookings
  ('22222222-aaaa-0000-0000-000000000005', 'direct', 'Shama', '2025-09-09', '2025-09-16', 925000, 0, 'uid-018@direct'),
  ('22222222-aaaa-0000-0000-000000000005', 'direct', 'ראש השנה', '2025-09-22', '2025-09-24', 450000, 0, 'uid-019@direct'),
  ('22222222-aaaa-0000-0000-000000000005', 'direct', 'Kelmers', '2025-10-03', '2025-10-16', 5735000, 0, 'uid-020@direct');

-- ============================================
-- BILLS (sample utility bills for properties)
-- ============================================

INSERT INTO bills (property_id, bill_type, amount_agorot, due_date, status, is_anomaly) VALUES
  -- Savyon View — Gas: פזגז 25091369
  ('22222222-aaaa-0000-0000-000000000001', 'gas', 35000, '2026-04-15', 'approved', false),
  ('22222222-aaaa-0000-0000-000000000001', 'water', 42000, '2026-04-20', 'pending_review', false),
  ('22222222-aaaa-0000-0000-000000000001', 'iec', 58000, '2026-04-18', 'approved', false),
  ('22222222-aaaa-0000-0000-000000000001', 'arnona', 92000, '2026-04-15', 'approved', false),
  -- Agripas 6 — Gas: פזגז 25086129, Electricity: 348297485
  ('22222222-aaaa-0000-0000-000000000002', 'gas', 28000, '2026-04-15', 'approved', false),
  ('22222222-aaaa-0000-0000-000000000002', 'iec', 45000, '2026-04-20', 'pending_review', false),
  ('22222222-aaaa-0000-0000-000000000002', 'arnona', 78000, '2026-04-15', 'approved', false),
  -- Agripas 8 — Gas: פזגז 25086128, Electricity: 348123528
  ('22222222-aaaa-0000-0000-000000000003', 'gas', 31000, '2026-04-15', 'approved', false),
  ('22222222-aaaa-0000-0000-000000000003', 'iec', 82000, '2026-04-20', 'flagged', true),
  ('22222222-aaaa-0000-0000-000000000003', 'water', 22000, '2026-04-18', 'approved', false),
  -- Raul Wallenberg — Gas: דורגז 32025459, Electricity: 347783964
  ('22222222-aaaa-0000-0000-000000000004', 'gas', 29000, '2026-04-15', 'approved', false),
  ('22222222-aaaa-0000-0000-000000000004', 'iec', 51000, '2026-04-20', 'pending_review', false),
  -- Keren Hayesod 5 — Electricity: 347013240
  ('22222222-aaaa-0000-0000-000000000005', 'iec', 62000, '2026-04-20', 'approved', false),
  ('22222222-aaaa-0000-0000-000000000005', 'arnona', 85000, '2026-04-15', 'approved', false);

-- ============================================
-- TASKS
-- ============================================

INSERT INTO tasks (id, property_id, contractor_id, title, status, priority, is_cleaning, due_date) VALUES
  ('44444444-aaaa-0000-0000-000000000001', '22222222-aaaa-0000-0000-000000000001', '33333333-aaaa-0000-0000-000000000002', 'Turnover clean — Savyon View', 'pending', 'high', true, '2026-04-08'),
  ('44444444-aaaa-0000-0000-000000000002', '22222222-aaaa-0000-0000-000000000002', '33333333-aaaa-0000-0000-000000000001', 'Fix kitchen faucet — Agripas 6', 'in_progress', 'high', false, '2026-04-06'),
  ('44444444-aaaa-0000-0000-000000000003', '22222222-aaaa-0000-0000-000000000003', NULL, 'AC Deep Clean — Agripas 8', 'pending', 'normal', false, '2026-04-15'),
  ('44444444-aaaa-0000-0000-000000000004', '22222222-aaaa-0000-0000-000000000005', '33333333-aaaa-0000-0000-000000000002', 'Post-checkout clean — KH5', 'completed', 'high', true, '2026-04-01'),
  ('44444444-aaaa-0000-0000-000000000005', '22222222-aaaa-0000-0000-000000000004', '33333333-aaaa-0000-0000-000000000003', 'Replace bathroom light — Raul Wallenberg', 'pending', 'normal', false, '2026-04-10');

-- Checklists
INSERT INTO task_checklist_items (task_id, label, is_completed, sort_order) VALUES
  ('44444444-aaaa-0000-0000-000000000001', 'Flush all toilets (Nia check)', false, 0),
  ('44444444-aaaa-0000-0000-000000000001', 'Run all sinks', false, 1),
  ('44444444-aaaa-0000-0000-000000000001', 'Check boiler pilot', false, 2),
  ('44444444-aaaa-0000-0000-000000000001', 'Inspect window seals', false, 3),
  ('44444444-aaaa-0000-0000-000000000001', 'Test AC remote', false, 4),
  ('44444444-aaaa-0000-0000-000000000001', 'Final staging photo', false, 5),
  ('44444444-aaaa-0000-0000-000000000002', 'Turn off water supply', true, 0),
  ('44444444-aaaa-0000-0000-000000000002', 'Replace faucet cartridge', false, 1),
  ('44444444-aaaa-0000-0000-000000000002', 'Test for leaks', false, 2);

-- ============================================
-- INVENTORY
-- ============================================

INSERT INTO inventory_items (property_id, item_name, quantity_in_closet, quantity_at_laundry, quantity_damaged, par_level) VALUES
  ('22222222-aaaa-0000-0000-000000000001', 'Bath towels', 8, 4, 0, 6),
  ('22222222-aaaa-0000-0000-000000000001', 'Bed sheets (double)', 4, 2, 0, 4),
  ('22222222-aaaa-0000-0000-000000000002', 'Bath towels', 3, 3, 0, 4),
  ('22222222-aaaa-0000-0000-000000000002', 'Bed sheets (double)', 2, 2, 0, 4),
  ('22222222-aaaa-0000-0000-000000000003', 'Bath towels', 6, 2, 0, 6),
  ('22222222-aaaa-0000-0000-000000000005', 'Bath towels', 10, 0, 0, 8),
  ('22222222-aaaa-0000-0000-000000000005', 'Bed sheets (king)', 4, 2, 0, 4);

-- ============================================
-- REVENUE TRACKING (YTD 2026)
-- ============================================

INSERT INTO revenue_tracking (year, month, total_revenue_agorot) VALUES
  (2026, 1, 3200000),
  (2026, 2, 2850000),
  (2026, 3, 3480000);

-- ============================================
-- DOCUMENTS (Vault)
-- ============================================

INSERT INTO documents (property_id, owner_id, category, title, storage_path, uploaded_by) VALUES
  ('22222222-aaaa-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 'contract', 'Management Agreement — Savyon View', 'vault/contract-savyon.pdf', 'admin'),
  ('22222222-aaaa-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000002', 'insurance', 'Insurance Policy 2026 — Agripas 6', 'vault/insurance-agripas6.pdf', 'admin'),
  ('22222222-aaaa-0000-0000-000000000005', '11111111-aaaa-0000-0000-000000000004', 'tabu', 'Tabu — Keren Hayesod 5', 'vault/tabu-kh5.pdf', 'owner');
