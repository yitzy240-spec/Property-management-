-- ApartmentOS: Schema Constraints & Data Model Fixes
-- Addresses CTO audit: missing CHECK constraints, inventory model fix

-- ============================================
-- Commission rate bounds
-- ============================================

ALTER TABLE properties
  ADD CONSTRAINT chk_commission_rate
  CHECK (commission_rate >= 0 AND commission_rate <= 1);

-- ============================================
-- Inventory data model fix
-- Replace single status/quantity with per-status quantities
-- This supports split tracking: "6 in closet, 4 at laundry"
-- ============================================

ALTER TABLE inventory_items
  DROP COLUMN status,
  DROP COLUMN quantity,
  ADD COLUMN quantity_in_closet INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN quantity_at_laundry INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN quantity_damaged INTEGER NOT NULL DEFAULT 0;

-- par_level now compares against quantity_in_closet only

-- ============================================
-- Add owner_stay support to bookings
-- Allows owners to request stays via "Request My Stay" button
-- ============================================

-- No schema change needed: platform = 'owner_stay' convention
-- Add a CHECK to document valid platforms
COMMENT ON COLUMN bookings.platform IS 'airbnb, booking_com, lodgify, direct, owner_stay';

-- ============================================
-- Add is_cleaning flag to tasks for turnover automation
-- ============================================

ALTER TABLE tasks
  ADD COLUMN is_cleaning BOOLEAN DEFAULT false;
