-- ApartmentOS: Utility account tracking + booking payment tracking

-- 1. Property Utility Accounts
CREATE TABLE IF NOT EXISTS property_utility_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  utility_type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL,
  provider_name TEXT,
  autopay BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_utility_accounts_property ON property_utility_accounts(property_id);
CREATE INDEX idx_utility_accounts_lookup ON property_utility_accounts(utility_type, account_number);

ALTER TABLE property_utility_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners see own property utilities" ON property_utility_accounts FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE owner_id IN (SELECT id FROM owners WHERE auth_user_id = auth.uid())));

CREATE POLICY "Admin full access on utility accounts" ON property_utility_accounts FOR ALL
  USING (EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND (auth.users.raw_app_meta_data->>'role' = 'admin')));

CREATE TRIGGER set_updated_at_utility_accounts BEFORE UPDATE ON property_utility_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Booking columns for payment tracking + multi-currency
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ILS';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_amount_cents INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10, 4);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_amount_agorot INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_collected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount_agorot INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Booking Payments table
DO $$ BEGIN CREATE TYPE payment_method AS ENUM ('bank_transfer','cash','bit','credit_card','paypal','check','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_agorot INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  original_amount_cents INTEGER,
  method payment_method NOT NULL DEFAULT 'bank_transfer',
  payment_date DATE,
  received_by TEXT,
  is_deposit BOOLEAN NOT NULL DEFAULT false,
  is_commission BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_payments_booking ON booking_payments(booking_id);

ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners see own booking payments" ON booking_payments FOR SELECT
  USING (booking_id IN (SELECT id FROM bookings WHERE property_id IN (SELECT id FROM properties WHERE owner_id IN (SELECT id FROM owners WHERE auth_user_id = auth.uid()))));

CREATE POLICY "Admin full access on booking payments" ON booking_payments FOR ALL
  USING (EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND (auth.users.raw_app_meta_data->>'role' = 'admin')));

CREATE TRIGGER set_updated_at_booking_payments BEFORE UPDATE ON booking_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
