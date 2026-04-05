-- ApartmentOS: Learned bill-to-property mappings
-- Once a bill sender is associated with a property, future bills auto-match.
-- Admin can confirm or correct via the bills UI.

CREATE TABLE bill_sender_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email TEXT NOT NULL,           -- From: header of the email
  sender_name_pattern TEXT,             -- e.g. "עיריית ירושלים" or "IEC"
  subject_pattern TEXT,                 -- e.g. owner name or account number
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  bill_type TEXT,                       -- arnona, iec, water, etc.
  confirmed BOOLEAN NOT NULL DEFAULT false,  -- true = admin confirmed this mapping
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sender_email, property_id, bill_type)
);

ALTER TABLE bill_sender_mappings ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bill_sender_email ON bill_sender_mappings(sender_email);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bill_sender_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
