-- ApartmentOS: Green Invoice integration columns
-- Store Green Invoice client IDs on owners for invoice generation
-- Store expected bill dates for prediction
-- Store Green Invoice document IDs on fee entries

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS green_invoice_client_id TEXT;

-- Bill timing prediction: track expected billing cycle per property+type
CREATE TABLE IF NOT EXISTS bill_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  bill_type TEXT NOT NULL,
  expected_day_of_month INTEGER,         -- e.g. 15 = bills arrive around the 15th
  cycle_months INTEGER NOT NULL DEFAULT 1, -- 1=monthly, 2=bimonthly
  last_received_at DATE,                 -- date of most recently received bill
  next_expected_at DATE,                 -- predicted next bill date
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, bill_type)
);

ALTER TABLE bill_schedules ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bill_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add Green Invoice document ID to fee_entries for linking
ALTER TABLE fee_entries
  ADD COLUMN IF NOT EXISTS invoice_id TEXT;
