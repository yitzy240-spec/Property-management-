-- ApartmentOS: Owner-Admin Messaging
-- Simple property-scoped message threads between owners and admin

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'owner')),
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners see messages on own properties"
  ON messages FOR SELECT
  USING (property_id IN (
    SELECT p.id FROM properties p
    JOIN owners o ON p.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

CREATE POLICY "Owners send messages on own properties"
  ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'owner'
    AND property_id IN (
      SELECT p.id FROM properties p
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_messages_property ON messages(property_id);
CREATE INDEX idx_messages_property_created ON messages(property_id, created_at);
CREATE INDEX idx_messages_unread ON messages(property_id, is_read) WHERE NOT is_read;
