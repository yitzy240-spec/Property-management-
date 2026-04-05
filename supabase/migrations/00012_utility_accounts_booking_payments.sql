-- ApartmentOS Migration 00012: Utility Accounts, Multi-Currency, Booking Payments
--
-- Adds:
-- 1. property_utility_accounts — per-property utility account numbers for bill matching
-- 2. Multi-currency support on bookings (original amount + currency + ILS equivalent)
-- 3. booking_payments — per-booking payment tracking (deposits, commissions, installments)
-- 4. Booking notes and payment summary columns

-- ============================================
-- 1. PROPERTY UTILITY ACCOUNTS
-- ============================================

CREATE TABLE property_utility_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  utility_type bill_type NOT NULL,           -- reuse existing enum: arnona, iec, water, gas, vaad_bayit, internet, other
  label TEXT NOT NULL,                       -- display label, e.g. "מספר לקוח", "חשבון חוזה", "מספר מונה"
  account_number TEXT NOT NULL,              -- the actual number, e.g. "25091369", "100425304"
  autopay BOOLEAN NOT NULL DEFAULT false,    -- is this on autopay/standing order?
  notes TEXT,                                -- free text, e.g. "פזגז contract" or "shared meter with unit 3"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A property should not have duplicate account numbers for the same utility type + label
  UNIQUE(property_id, utility_type, label)
);

ALTER TABLE property_utility_accounts ENABLE ROW LEVEL SECURITY;

-- Bill matching index: find property by utility type + account number
CREATE INDEX idx_utility_accounts_lookup
  ON property_utility_accounts(utility_type, account_number);

CREATE INDEX idx_utility_accounts_property
  ON property_utility_accounts(property_id);

-- RLS: owners see their own property utility accounts
CREATE POLICY "Owners see own utility accounts"
  ON property_utility_accounts FOR SELECT
  USING (property_id IN (
    SELECT p.id FROM properties p
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON property_utility_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 2. MULTI-CURRENCY + PAYMENT SUMMARY ON BOOKINGS
-- ============================================

-- Currency for the booking's original amount
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'ILS';

-- Original amount in the booking's native currency (integer cents/agorot)
-- e.g. $800 USD = 80000, ₪3000 ILS = 300000
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS original_amount_cents INTEGER;

-- Exchange rate used when converting to ILS (for audit trail)
-- NULL when currency = 'ILS'
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4);

-- Commission amount in agorot (auto-calculated from property commission_rate)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS commission_amount_agorot INTEGER;

-- Commission currency (may differ from booking currency per client requirement)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS commission_currency CHAR(3) NOT NULL DEFAULT 'ILS';

-- Commission in original currency cents (when commission_currency != 'ILS')
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS commission_original_cents INTEGER;

-- Deposit amount in agorot
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_amount_agorot INTEGER;

-- Overall payment status for this booking
CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'complete');

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'pending';

-- Free-text operational notes per booking
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for filtering by payment status in dashboards
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);

-- ============================================
-- 3. BOOKING PAYMENTS TABLE
-- ============================================

CREATE TYPE payment_method AS ENUM ('bank_transfer', 'cash', 'bit', 'credit_card', 'paypal', 'check', 'other');

CREATE TABLE booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_agorot INTEGER NOT NULL,            -- payment amount in agorot (ILS)
  currency CHAR(3) NOT NULL DEFAULT 'ILS',   -- currency of this payment
  original_amount_cents INTEGER,             -- amount in original currency if not ILS
  payment_method payment_method NOT NULL DEFAULT 'bank_transfer',
  payment_date DATE,                         -- when the payment was made/received
  received_by TEXT,                          -- who received it, e.g. "Sara", "admin"
  is_deposit BOOLEAN NOT NULL DEFAULT false, -- is this a deposit vs regular payment?
  is_commission BOOLEAN NOT NULL DEFAULT false, -- is this a commission payment?
  notes TEXT,                                -- e.g. "paid 20% to us", "monthly installment 2/3"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_booking_payments_booking ON booking_payments(booking_id);
CREATE INDEX idx_booking_payments_date ON booking_payments(payment_date);

-- RLS: owners see payments for their own bookings
CREATE POLICY "Owners see own booking payments"
  ON booking_payments FOR SELECT
  USING (booking_id IN (
    SELECT b.id FROM bookings b
    JOIN properties p ON b.property_id = p.id
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON booking_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 4. COMMENT: AI BILL MATCHING ENHANCEMENT
-- ============================================
-- The parse-bills cron (src/app/api/cron/parse-bills/route.ts) should add
-- a new matching step BEFORE owner-name matching:
--
--   SELECT property_id FROM property_utility_accounts
--   WHERE utility_type = $bill_type
--     AND account_number = $extracted_account_number
--
-- The AI extraction prompt should be updated to also extract:
--   - account_number: the utility account/contract/meter number on the bill
--
-- This gives the highest-confidence match (more reliable than sender or name matching).
