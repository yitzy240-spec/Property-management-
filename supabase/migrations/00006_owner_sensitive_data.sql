-- ApartmentOS: Secure storage for owner PII
-- Passport numbers: encrypted via AES-256-GCM (application layer)
-- Credit cards: last 4 digits + card type ONLY (no full CC numbers — PCI compliance)

CREATE TABLE owner_sensitive_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL CHECK (data_type IN ('passport', 'credit_card_summary')),
  encrypted_value TEXT,          -- AES-256-GCM via encryption.ts (passport numbers only)
  card_last_four CHAR(4),       -- Plaintext, only for credit_card_summary
  card_type TEXT,                -- visa, mastercard, amex, etc.
  label TEXT,                    -- "Main Visa", "Business passport"
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, data_type, label)
);

ALTER TABLE owner_sensitive_data ENABLE ROW LEVEL SECURITY;

-- NO policies = service role only (admin access via server-side API routes)
-- Owners never see this table. Client-side queries return zero rows.

CREATE INDEX idx_sensitive_data_owner ON owner_sensitive_data(owner_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON owner_sensitive_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
