-- Admin RLS policies for messages table
-- Admin is identified by checking they are NOT in the owners table
-- (single admin user pattern — can be upgraded to a roles table later)

-- Admin can read all messages
CREATE POLICY "Admin sees all messages"
  ON messages FOR SELECT
  USING (
    NOT EXISTS (
      SELECT 1 FROM owners WHERE auth_user_id = auth.uid()
    )
  );

-- Admin can send messages (enforces sender_role = 'admin')
CREATE POLICY "Admin sends messages"
  ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM owners WHERE auth_user_id = auth.uid()
    )
  );

-- Admin can mark messages as read
CREATE POLICY "Admin marks messages read"
  ON messages FOR UPDATE
  USING (
    NOT EXISTS (
      SELECT 1 FROM owners WHERE auth_user_id = auth.uid()
    )
  );

-- Owner can mark messages as read (their own property messages)
CREATE POLICY "Owners mark messages read"
  ON messages FOR UPDATE
  USING (
    property_id IN (
      SELECT p.id FROM properties p
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );
